// Inline parser: phase 2 of parsing.
//
// Runs once per leaf block with inline content. Text is scanned left to
// right; at each trigger character the registered rules are tried in order.
// Emphasis and links are resolved with the delimiter-stack algorithm from
// the CommonMark spec appendix ("process emphasis", "look for link or image").

import type { DelimiterRule, InlineRule, Node, Reference } from '../types.ts'
import { C_BACKSLASH, C_CLOSE_PAREN, C_COLON, C_LESSTHAN, C_NEWLINE, C_OPEN_BRACKET, C_OPEN_PAREN, C_UNDERSCORE, ENTITY, ESCAPABLE, isPunctuation, isUnicodeWhitespace } from '../util/common.ts'
import { decodeReference, type EntityDecoder, unescapeString } from '../util/entities.ts'
import { reHtmlTag } from '../util/html.ts'
import { normalizeLabel, normalizeUrl } from '../util/normalize.ts'
import { MAX_NESTING } from '../block/parser.ts'

/** Parentheses nesting allowed in bare link destinations (the spec allows a limit). */
const MAX_PAREN_DEPTH = 32

const ESCAPED_CHAR = `\\\\${ESCAPABLE}`
const reLinkTitle = new RegExp(
  `"(?:${ESCAPED_CHAR}|\\\\[^\\\\]|[^\\\\"\\x00])*"` +
    `|'(?:${ESCAPED_CHAR}|\\\\[^\\\\]|[^\\\\'\\x00])*'` +
    `|\\((?:${ESCAPED_CHAR}|\\\\[^\\\\]|[^\\\\()\\x00])*\\)`,
  'y',
)
const reLinkDestinationBraces = /<(?:[^<>\n\\\x00]|\\.)*>/y
const reEscapable = new RegExp(`^${ESCAPABLE}`)
const reEntityHere = new RegExp(ENTITY, 'iy')
const reTicksHere = /`+/y
const reTicks = /`+/g
const reEmailAutolink =
  /<([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/y
const reAutolink = /<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/y
const reSpnl = /[ \t]*(?:\n[ \t]*)?/y
const reWhitespaceChar = /^[ \t\n\x0b\x0c\x0d]/
const reInitialSpace = /[ \t]*/y
const reSpaceAtEndOfLine = /[ \t]*(?:\n|$)/y
const reLinkLabel = /\[(?:[^\\[\]]|\\.){0,1000}\]/sy
const reFinalSpace = / *$/

/** Linked-list node used while parsing; converted to plain AST nodes at the end. */
class Inl {
  node: Node
  /** Children come from the linked list (emphasis, links) rather than `node.children`. */
  container: boolean
  /** Nesting depth of container inlines below this one. */
  depth = 0
  parent: Inl | null = null
  first: Inl | null = null
  last: Inl | null = null
  prev: Inl | null = null
  next: Inl | null = null

  constructor(node: Node, container = false) {
    this.node = node
    this.container = container
  }

  append(child: Inl): void {
    child.unlink()
    child.parent = this
    if (this.last) {
      this.last.next = child
      child.prev = this.last
      this.last = child
    } else {
      this.first = this.last = child
    }
  }

  insertAfter(sibling: Inl): void {
    sibling.unlink()
    sibling.next = this.next
    if (sibling.next) sibling.next.prev = sibling
    sibling.prev = this
    this.next = sibling
    sibling.parent = this.parent
    if (!sibling.next && sibling.parent) sibling.parent.last = sibling
  }

  unlink(): void {
    if (this.prev) this.prev.next = this.next
    else if (this.parent) this.parent.first = this.next
    if (this.next) this.next.prev = this.prev
    else if (this.parent) this.parent.last = this.prev
    this.parent = this.prev = this.next = null
  }
}

/** Depth a container would have if it wrapped the siblings from `from` up to (excluding) `to`. */
function wrapDepth(from: Inl | null, to: Inl | null): number {
  let d = 0
  for (let n = from; n && n !== to; n = n.next) if (n.depth > d) d = n.depth
  return d + 1
}

interface Delimiter {
  cc: number
  numdelims: number
  origdelims: number
  inl: Inl
  previous: Delimiter | null
  next: Delimiter | null
  canOpen: boolean
  canClose: boolean
}

interface Bracket {
  inl: Inl
  previous: Bracket | null
  previousDelimiter: Delimiter | null
  /** Position of the `[` in the subject. */
  index: number
  image: boolean
  active: boolean
  bracketAfter: boolean
}

/** Precomputed rule tables, shared by every parse with the same configuration. */
export interface InlineConfig {
  /** Rules by trigger char code, in priority order. */
  rules: Map<number, InlineRule[]>
  /** Delimiter chars; `null` marks core emphasis (`*` and `_`). */
  delimiters: Map<number, DelimiterRule | null>
  /** Sticky regex matching a run of non-trigger characters. */
  reText: RegExp
  decodeEntity: EntityDecoder
}

export class InlineParser {
  /** The text being parsed. */
  src = ''
  /** Current position in `src`. */
  pos = 0
  refs: Map<string, Reference>

  private readonly cfg: InlineConfig
  private root = new Inl({ type: 'root' }, true)
  private delimiters: Delimiter | null = null
  private brackets: Bracket | null = null
  /** Backtick memo: start of the last run of each length, valid once a scan reached the end. */
  private tickRuns = new Map<number, number>()
  private ticksScanned = false
  /** Memo of `src.lastIndexOf(token)` for raw HTML terminators. */
  private lastIndex = new Map<string, number>()

  constructor(cfg: InlineConfig, refs: Map<string, Reference>) {
    this.cfg = cfg
    this.refs = refs
  }

  /** Parse `src` as inline content. Re-entrant: plugins may call it from a rule. */
  parse(src: string): Node[] {
    const { src: s0, pos: p0, root: r0, delimiters: d0, brackets: b0, tickRuns: t0, ticksScanned: ts0, lastIndex: l0 } = this
    this.src = src
    this.pos = 0
    this.root = new Inl({ type: 'root' }, true)
    this.delimiters = null
    this.brackets = null
    this.tickRuns = new Map()
    this.ticksScanned = false
    this.lastIndex = new Map()
    while (this.pos < this.src.length) this.parseInline()
    this.processEmphasis(null)
    const out = collect(this.root.first)
    this.src = s0
    this.pos = p0
    this.root = r0
    this.delimiters = d0
    this.brackets = b0
    this.tickRuns = t0
    this.ticksScanned = ts0
    this.lastIndex = l0
    return out
  }

  // --- API for rules ----------------------------------------------------------

  /** Char code at `pos + ahead`, or -1 at the end. */
  peek(ahead = 0): number {
    const i = this.pos + ahead
    return i < this.src.length ? this.src.charCodeAt(i) : -1
  }

  /** Match a sticky (`y`) or global (`g`) regex at `pos`; advance past the match. */
  match(re: RegExp): string | null {
    re.lastIndex = this.pos
    const m = re.exec(this.src)
    if (m === null) return null
    this.pos = re.lastIndex
    return m[0]
  }

  /** Append a finished AST node. */
  push(node: Node): void {
    this.root.append(new Inl(node))
  }

  /** Append literal text. */
  text(value: string): void {
    this.root.append(new Inl({ type: 'text', value }))
  }

  unescape(s: string): string {
    return unescapeString(s, this.cfg.decodeEntity)
  }

  // --- Main dispatch ------------------------------------------------------------

  private parseInline(): void {
    const c = this.src.charCodeAt(this.pos)
    const rules = this.cfg.rules.get(c)
    if (rules) {
      for (const rule of rules) if (rule.parse(this)) return
      this.pos++
      this.text(String.fromCharCode(c))
      return
    }
    const m = this.match(this.cfg.reText)
    this.text(m ?? this.src[this.pos++])
  }

  // --- Core constructs (used by the rules in rules.ts) --------------------------

  parseNewline(): boolean {
    this.pos++
    const last = this.root.last
    const value = last?.node.type === 'text' ? (last.node.value as string) : ''
    if (value.endsWith(' ')) {
      last!.node.value = value.replace(reFinalSpace, '')
      if (value.endsWith('  ')) this.push({ type: 'break' })
      else this.text('\n')
    } else {
      this.text('\n')
    }
    this.match(reInitialSpace)
    return true
  }

  parseBackslash(): boolean {
    this.pos++
    const c = this.peek()
    if (c === C_NEWLINE) {
      this.pos++
      this.push({ type: 'break' })
    } else if (c !== -1 && reEscapable.test(this.src[this.pos])) {
      this.text(this.src[this.pos++])
    } else {
      this.text('\\')
    }
    return true
  }

  parseBackticks(): boolean {
    const ticks = this.match(reTicksHere)
    if (ticks === null) return false
    const afterOpen = this.pos
    // After one full scan we know where the last run of each length is: if
    // none of this length comes later, there is no closer (avoids O(n²)).
    if (this.ticksScanned && (this.tickRuns.get(ticks.length) ?? -1) < afterOpen) {
      this.text(ticks)
      return true
    }
    let m: string | null
    while ((m = this.match(reTicks)) !== null) {
      this.tickRuns.set(m.length, this.pos - m.length)
      if (m === ticks) {
        let value = this.src.slice(afterOpen, this.pos - ticks.length).replace(/\n/g, ' ')
        // Strip one space on each side, unless the content is only spaces.
        if (value[0] === ' ' && value[value.length - 1] === ' ' && /[^ ]/.test(value)) value = value.slice(1, -1)
        this.push({ type: 'inlineCode', value })
        return true
      }
    }
    this.ticksScanned = true
    this.pos = afterOpen
    this.text(ticks)
    return true
  }

  parseAutolink(): boolean {
    let m = this.match(reEmailAutolink)
    let url: string
    if (m) {
      url = 'mailto:' + m.slice(1, -1)
    } else if ((m = this.match(reAutolink))) {
      url = m.slice(1, -1)
    } else {
      return false
    }
    this.push({ type: 'link', url: normalizeUrl(url), title: null, children: [{ type: 'text', value: m.slice(1, -1) }] })
    return true
  }

  parseHtmlTag(): boolean {
    // Comments, processing instructions and CDATA need a terminator somewhere
    // later in the text; checking once avoids rescanning to the end each time.
    const rest = this.src.slice(this.pos, this.pos + 9)
    const end = rest.startsWith('<!--') ? '-->' : rest.startsWith('<?') ? '?>' : rest.startsWith('<![CDATA[') ? ']]>' : null
    if (end && !rest.startsWith('<!-->') && !rest.startsWith('<!--->') && this.lastIndexOf(end) < this.pos + 2) return false
    const m = this.match(reHtmlTag)
    if (m === null) return false
    this.push({ type: 'html', value: m })
    return true
  }

  private lastIndexOf(token: string): number {
    let i = this.lastIndex.get(token)
    if (i === undefined) this.lastIndex.set(token, (i = this.src.lastIndexOf(token)))
    return i
  }

  parseEntity(): boolean {
    const m = this.match(reEntityHere)
    if (m === null) return false
    this.text(decodeReference(m, this.cfg.decodeEntity))
    return true
  }

  // --- Emphasis -------------------------------------------------------------------

  private scanDelims(cc: number): { numdelims: number; canOpen: boolean; canClose: boolean } | null {
    const start = this.pos
    let numdelims = 0
    while (this.peek() === cc) {
      numdelims++
      this.pos++
    }
    if (numdelims === 0) return null
    const before = start === 0 ? '\n' : charBefore(this.src, start)
    const after = this.pos >= this.src.length ? '\n' : String.fromCodePoint(this.src.codePointAt(this.pos)!)
    this.pos = start

    const afterWs = isUnicodeWhitespace(after)
    const afterPunct = isPunctuation(after)
    const beforeWs = isUnicodeWhitespace(before)
    const beforePunct = isPunctuation(before)
    const leftFlanking = !afterWs && (!afterPunct || beforeWs || beforePunct)
    const rightFlanking = !beforeWs && (!beforePunct || afterWs || afterPunct)
    if (cc === C_UNDERSCORE) {
      // `_` cannot open or close inside a word.
      return {
        numdelims,
        canOpen: leftFlanking && (!rightFlanking || beforePunct),
        canClose: rightFlanking && (!leftFlanking || afterPunct),
      }
    }
    return { numdelims, canOpen: leftFlanking, canClose: rightFlanking }
  }

  /** Handle a run of delimiter characters (`*`, `_`, or a plugin delimiter). */
  handleDelim(cc: number): boolean {
    const res = this.scanDelims(cc)
    if (!res) return false
    const start = this.pos
    this.pos += res.numdelims
    const inl = new Inl({ type: 'text', value: this.src.slice(start, this.pos) })
    this.root.append(inl)
    if (res.canOpen || res.canClose) {
      this.delimiters = {
        cc,
        numdelims: res.numdelims,
        origdelims: res.numdelims,
        inl,
        previous: this.delimiters,
        next: null,
        canOpen: res.canOpen,
        canClose: res.canClose,
      }
      if (this.delimiters.previous) this.delimiters.previous.next = this.delimiters
    }
    return true
  }

  private removeDelimiter(d: Delimiter): void {
    if (d.previous) d.previous.next = d.next
    if (d.next === null) this.delimiters = d.previous
    else d.next.previous = d.previous
  }

  private processEmphasis(stackBottom: Delimiter | null): void {
    // Lower bound for opener searches, per closer kind (spec: "openers_bottom").
    const openersBottom = new Map<string, Delimiter | null>()
    let closer = this.delimiters
    while (closer !== null && closer.previous !== stackBottom) closer = closer.previous

    while (closer !== null) {
      if (!closer.canClose) {
        closer = closer.next
        continue
      }
      const custom = this.cfg.delimiters.get(closer.cc) ?? null
      const key = custom
        ? `${closer.cc}:${closer.origdelims}`
        : `${closer.cc}:${closer.canOpen ? 3 : 0}:${closer.origdelims % 3}`
      const bottom = openersBottom.has(key) ? openersBottom.get(key)! : stackBottom

      let opener = closer.previous
      let found = false
      while (opener !== null && opener !== stackBottom && opener !== bottom) {
        if (opener.cc === closer.cc && opener.canOpen) {
          if (custom) {
            if (opener.numdelims === closer.numdelims && custom.sizes.includes(closer.numdelims)) {
              found = true
              break
            }
          } else {
            // "Rule of 3": a run that can both open and close cannot match
            // another if the sum of their lengths is a multiple of 3.
            const oddMatch =
              (closer.canOpen || opener.canClose) &&
              closer.origdelims % 3 !== 0 &&
              (opener.origdelims + closer.origdelims) % 3 === 0
            if (!oddMatch) {
              found = true
              break
            }
          }
        }
        opener = opener.previous
      }

      // Refuse to nest deeper than MAX_NESTING: the delimiters stay literal.
      if (found && opener && wrapDepth(opener.inl.next, closer.inl) > MAX_NESTING) found = false

      const oldCloser = closer
      if (!found || opener === null) {
        closer = closer.next
        openersBottom.set(key, oldCloser.previous)
        if (!oldCloser.canOpen) this.removeDelimiter(oldCloser)
        continue
      }

      const used = custom ? closer.numdelims : closer.numdelims >= 2 && opener.numdelims >= 2 ? 2 : 1
      const type = custom ? custom.type : used === 1 ? 'emphasis' : 'strong'
      const openerInl = opener.inl
      const closerInl = closer.inl
      opener.numdelims -= used
      closer.numdelims -= used
      openerInl.node.value = (openerInl.node.value as string).slice(0, -used)
      closerInl.node.value = (closerInl.node.value as string).slice(0, -used)

      const wrapper = new Inl({ type }, true)
      wrapper.depth = wrapDepth(openerInl.next, closerInl)
      for (let tmp = openerInl.next; tmp && tmp !== closerInl; ) {
        const next = tmp.next
        wrapper.append(tmp)
        tmp = next
      }
      openerInl.insertAfter(wrapper)

      // Delimiters between opener and closer can no longer match anything.
      if (opener.next !== closer) {
        opener.next = closer
        closer.previous = opener
      }
      if (opener.numdelims === 0) {
        openerInl.unlink()
        this.removeDelimiter(opener)
      }
      if (closer.numdelims === 0) {
        closerInl.unlink()
        const next = closer.next
        this.removeDelimiter(closer)
        closer = next
      }
    }

    while (this.delimiters !== null && this.delimiters !== stackBottom) this.removeDelimiter(this.delimiters)
  }

  // --- Links and images -------------------------------------------------------------

  private addBracket(inl: Inl, index: number, image: boolean): void {
    if (this.brackets) this.brackets.bracketAfter = true
    this.brackets = {
      inl,
      previous: this.brackets,
      previousDelimiter: this.delimiters,
      index,
      image,
      active: true,
      bracketAfter: false,
    }
  }

  parseOpenBracket(): boolean {
    const start = this.pos
    this.pos++
    const inl = new Inl({ type: 'text', value: '[' })
    this.root.append(inl)
    this.addBracket(inl, start, false)
    return true
  }

  parseBang(): boolean {
    const start = this.pos
    this.pos++
    if (this.peek() === C_OPEN_BRACKET) {
      this.pos++
      const inl = new Inl({ type: 'text', value: '![' })
      this.root.append(inl)
      this.addBracket(inl, start + 1, true)
    } else {
      this.text('!')
    }
    return true
  }

  parseCloseBracket(): boolean {
    this.pos++
    const startpos = this.pos
    const opener = this.brackets
    if (opener === null) {
      this.text(']')
      return true
    }
    if (!opener.active) {
      this.text(']')
      this.brackets = opener.previous
      return true
    }

    const isImage = opener.image
    const savepos = this.pos
    let url: string | null = null
    let title: string | null = null
    let matched = false

    // Inline link: [text](destination "title")
    if (this.peek() === C_OPEN_PAREN) {
      this.pos++
      this.spnl()
      if ((url = this.parseLinkDestination()) !== null) {
        this.spnl()
        // A title must be separated from the destination by whitespace.
        if (reWhitespaceChar.test(this.src.charAt(this.pos - 1))) title = this.parseLinkTitle()
        this.spnl()
        if (this.peek() === C_CLOSE_PAREN) {
          this.pos++
          matched = true
        }
      }
      if (!matched) this.pos = savepos
    }

    // Reference link: [text][label], [text][] or [text]
    if (!matched) {
      const beforeLabel = this.pos
      const n = this.parseLinkLabel()
      let label: string | null = null
      if (n > 2) label = this.src.slice(beforeLabel + 1, beforeLabel + n - 1)
      else if (!opener.bracketAfter) label = this.src.slice(opener.index + 1, startpos - 1)
      if (n === 0) this.pos = savepos // shortcut: rewind before skipped spaces
      if (label !== null) {
        const ref = this.refs.get(normalizeLabel(label))
        if (ref) {
          url = ref.url
          title = ref.title
          matched = true
        }
      }
    }

    const depth = matched ? wrapDepth(opener.inl.next, null) : 0
    if (!matched || depth > MAX_NESTING) {
      this.brackets = opener.previous
      this.pos = startpos
      this.text(']')
      return true
    }

    const inl = new Inl({ type: isImage ? 'image' : 'link', url, title: title || null }, true)
    inl.depth = depth
    for (let tmp = opener.inl.next; tmp; ) {
      const next = tmp.next
      inl.append(tmp)
      tmp = next
    }
    this.root.append(inl)
    this.processEmphasis(opener.previousDelimiter)
    this.brackets = opener.previous
    opener.inl.unlink()
    // No links inside links: deactivate earlier `[` openers.
    if (!isImage) for (let b = this.brackets; b; b = b.previous) if (!b.image) b.active = false
    return true
  }

  private spnl(): void {
    this.match(reSpnl)
  }

  private parseLinkTitle(): string | null {
    const title = this.match(reLinkTitle)
    return title === null ? null : this.unescape(title.slice(1, -1))
  }

  private parseLinkDestination(): string | null {
    const braced = this.match(reLinkDestinationBraces)
    if (braced !== null) return normalizeUrl(this.unescape(braced.slice(1, -1)))
    if (this.peek() === C_LESSTHAN) return null
    const savepos = this.pos
    let openparens = 0
    let c: number
    while ((c = this.peek()) !== -1) {
      if (c === C_BACKSLASH && reEscapable.test(this.src.charAt(this.pos + 1))) {
        this.pos += 2
      } else if (c === C_OPEN_PAREN) {
        if (++openparens > MAX_PAREN_DEPTH) break
        this.pos++
      } else if (c === C_CLOSE_PAREN) {
        if (openparens < 1) break
        this.pos++
        openparens--
      } else if (reWhitespaceChar.test(String.fromCharCode(c)) || c < 0x20 || c === 0x7f) {
        break
      } else {
        this.pos++
      }
    }
    if ((this.pos === savepos && c !== C_CLOSE_PAREN) || openparens !== 0) {
      this.pos = savepos
      return null
    }
    return normalizeUrl(this.unescape(this.src.slice(savepos, this.pos)))
  }

  /** Length of the link label at `pos` (including brackets), or 0. */
  private parseLinkLabel(): number {
    const m = this.match(reLinkLabel)
    return m === null || m.length > 1001 ? 0 : m.length
  }

  /**
   * Parse one link reference definition at the start of `s` and store it in
   * `refs` (first definition wins). Returns the number of chars consumed.
   */
  parseReference(s: string, refs: Map<string, Reference>): number {
    const { src: s0, pos: p0 } = this
    this.src = s
    this.pos = 0
    const consumed = this.parseReferenceHere(refs)
    this.src = s0
    this.pos = p0
    return consumed
  }

  private parseReferenceHere(refs: Map<string, Reference>): number {
    const n = this.parseLinkLabel()
    if (n === 0) return 0
    const rawLabel = this.src.slice(1, n - 1)
    if (this.peek() !== C_COLON) return 0
    this.pos++
    this.spnl()
    const url = this.parseLinkDestination()
    if (url === null) return 0

    const beforeTitle = this.pos
    this.spnl()
    let title: string | null = null
    if (this.pos !== beforeTitle) title = this.parseLinkTitle()
    if (title === null) this.pos = beforeTitle

    // The definition must end at a line ending. If a title was found but text
    // follows it, retry without the title.
    if (this.match(reSpaceAtEndOfLine) === null) {
      if (title === null) return 0
      title = null
      this.pos = beforeTitle
      if (this.match(reSpaceAtEndOfLine) === null) return 0
    }

    const label = normalizeLabel(rawLabel)
    if (label === '') return 0
    if (!refs.has(label)) refs.set(label, { url, title })
    return this.pos
  }
}

function charBefore(s: string, i: number): string {
  const c = s.charCodeAt(i - 1)
  return c >= 0xdc00 && c <= 0xdfff && i >= 2 ? s.slice(i - 2, i) : s[i - 1]
}

/** Plain-text content of nodes (image alt text). */
function plainText(nodes: Node[]): string {
  let s = ''
  for (const n of nodes) {
    if (n.type === 'image') s += n.alt
    else if (n.type === 'break') s += '\n'
    else if (n.type !== 'html' && typeof n.value === 'string') s += n.value
    else if (n.children) s += plainText(n.children)
  }
  return s
}

/** Convert the linked list into AST nodes, merging adjacent text. */
function collect(first: Inl | null): Node[] {
  const out: Node[] = []
  for (let n = first; n; n = n.next) {
    const node = n.node
    if (n.container) {
      const children = collect(n.first)
      if (node.type === 'image') node.alt = plainText(children)
      else node.children = children
    }
    if (node.type === 'text') {
      if (node.value === '') continue
      const prev = out[out.length - 1]
      if (prev?.type === 'text') {
        prev.value = (prev.value as string) + node.value
        continue
      }
    }
    out.push(node)
  }
  return out
}
