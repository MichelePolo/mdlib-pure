// Core CommonMark block rules.
//
// A rule with `continue` defines a block type; a rule with `start` opens
// blocks. The order of `start` rules in `coreBlockRules` is significant:
// it is the precedence order from the spec (e.g. setext before thematic
// break, so `---` under a paragraph is a heading underline).

import type { BlockRule } from '../types.ts'
import { C_GREATERTHAN, C_LESSTHAN, C_OPEN_BRACKET, C_SPACE, C_TAB, isSpaceOrTab, trimMd } from '../util/common.ts'
import { CLOSETAG, OPENTAG } from '../util/html.ts'
import { Block, type BlockParser, CODE_INDENT, MAX_NESTING } from './parser.ts'

const reNonSpace = /[^ \t\f\v\r\n]/
const isBlank = (s: string): boolean => !reNonSpace.test(s)

/** Consume link reference definitions at the start of a paragraph's content. */
function consumeReferences(p: BlockParser, b: Block): boolean {
  let found = false
  let pos: number
  while (b.content.charCodeAt(0) === C_OPEN_BRACKET && (pos = p.parseReference(b.content))) {
    b.content = b.content.slice(pos)
    found = true
  }
  return found
}

// --- Containers -------------------------------------------------------------

export const root: BlockRule = {
  name: 'root',
  content: 'block',
  continue: () => 0,
  canContain: (t) => t !== 'listItem',
}

/** Match `>` plus one optional space. Shared by start and continue. */
function blockquoteMarker(p: BlockParser): boolean {
  if (p.indented || p.peek(p.nextNonspace) !== C_GREATERTHAN) return false
  p.advanceNextNonspace()
  p.advanceOffset(1, false)
  if (isSpaceOrTab(p.peek(p.offset))) p.advanceOffset(1, true)
  return true
}

export const blockquote: BlockRule = {
  name: 'blockquote',
  triggers: '>',
  content: 'block',
  canContain: (t) => t !== 'listItem',
  continue: (p) => (blockquoteMarker(p) ? 0 : 1),
  start(p, container) {
    if (container.depth >= MAX_NESTING || !blockquoteMarker(p)) return 0
    p.closeUnmatchedBlocks()
    p.addChild('blockquote', p.nextNonspace)
    return 1
  },
}

// --- Lists ------------------------------------------------------------------

interface ListData {
  ordered: boolean
  bulletChar: string
  start: number | null
  delimiter: string
  padding: number
  markerOffset: number
}

const reBulletListMarker = /^[*+-]/
const reOrderedListMarker = /^(\d{1,9})([.)])/

function parseListMarker(p: BlockParser, container: Block): ListData | null {
  if (p.indent >= 4) return null
  const rest = p.rest()
  const data: ListData = { ordered: false, bulletChar: '', start: null, delimiter: '', padding: 0, markerOffset: p.indent }
  let m: RegExpMatchArray | null
  if ((m = rest.match(reBulletListMarker))) {
    data.bulletChar = m[0]
  } else if ((m = rest.match(reOrderedListMarker)) && (container.type !== 'paragraph' || parseInt(m[1], 10) === 1)) {
    data.ordered = true
    data.start = parseInt(m[1], 10)
    data.delimiter = m[2]
  } else {
    return null
  }
  // The marker must be followed by whitespace or the end of the line.
  let next = p.peek(p.nextNonspace + m[0].length)
  if (!(next === -1 || next === C_TAB || next === C_SPACE)) return null
  // An empty item cannot interrupt a paragraph.
  if (container.type === 'paragraph' && !reNonSpace.test(p.line.slice(p.nextNonspace + m[0].length))) return null

  p.advanceNextNonspace()
  p.advanceOffset(m[0].length, true)
  const spacesStartCol = p.column
  const spacesStartOffset = p.offset
  do {
    p.advanceOffset(1, true)
    next = p.peek(p.offset)
  } while (p.column - spacesStartCol < 5 && isSpaceOrTab(next))
  const blankItem = p.peek(p.offset) === -1
  const spacesAfterMarker = p.column - spacesStartCol
  if (spacesAfterMarker >= 5 || spacesAfterMarker < 1 || blankItem) {
    // 5+ spaces means indented code inside the item: padding is marker + 1.
    data.padding = m[0].length + 1
    p.column = spacesStartCol
    p.offset = spacesStartOffset
    if (isSpaceOrTab(p.peek(p.offset))) p.advanceOffset(1, true)
  } else {
    data.padding = m[0].length + spacesAfterMarker
  }
  return data
}

const listsMatch = (a: ListData, b: ListData): boolean =>
  a.ordered === b.ordered && a.delimiter === b.delimiter && a.bulletChar === b.bulletChar

/** True if a blank line separates two sibling blocks. */
const separatedByBlank = (a: Block, b: Block): boolean => a.endLine !== b.startLine - 1

export const list: BlockRule = {
  name: 'list',
  content: 'block',
  continue: () => 0,
  canContain: (t) => t === 'listItem',
  finalize(_p, b) {
    let tight = true
    const items = b.children
    outer: for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (i + 1 < items.length && separatedByBlank(item, items[i + 1])) {
        tight = false
        break
      }
      for (let j = 0; j + 1 < item.children.length; j++) {
        if (separatedByBlank(item.children[j], item.children[j + 1])) {
          tight = false
          break outer
        }
      }
    }
    b.node.spread = !tight
    for (const item of items) item.node.spread = !tight
    if (b.lastChild) b.endLine = b.lastChild.endLine
  },
}

export const listItem: BlockRule = {
  name: 'listItem',
  triggers: '*+-0123456789',
  content: 'block',
  canContain: (t) => t !== 'listItem',
  continue(p, b) {
    if (p.blank) {
      if (b.children.length === 0) return 1 // an item can begin with at most one blank line
      p.advanceNextNonspace()
    } else if (p.indent >= b.data.markerOffset + b.data.padding) {
      p.advanceOffset(b.data.markerOffset + b.data.padding, true)
    } else {
      return 1
    }
    return 0
  },
  finalize(_p, b) {
    // Trailing blank lines belong to no one: end the item at its last child.
    b.endLine = b.lastChild ? b.lastChild.endLine : b.startLine
  },
  start(p, container) {
    if ((p.indented && container.type !== 'list') || container.depth >= MAX_NESTING) return 0
    const data = parseListMarker(p, container)
    if (!data) return 0
    p.closeUnmatchedBlocks()
    if (p.tip.type !== 'list' || !listsMatch(p.tip.data as ListData, data)) {
      const l = p.addChild('list', p.nextNonspace)
      Object.assign(l.data, data)
      l.node.ordered = data.ordered
      l.node.start = data.start
      l.node.spread = false
    }
    const item = p.addChild('listItem', p.nextNonspace)
    Object.assign(item.data, data)
    item.node.spread = false
    return 1
  },
}

// --- Leaves -------------------------------------------------------------------

export const paragraph: BlockRule = {
  name: 'paragraph',
  acceptsLines: true,
  content: 'inline',
  continue: (p) => (p.blank ? 1 : 0),
  finalize(p, b) {
    if (consumeReferences(p, b) && isBlank(b.content)) b.remove()
  },
}

export const heading: BlockRule = {
  name: 'heading',
  content: 'inline',
  continue: () => 1, // headings are always a single line
}

const reATXHeadingMarker = /^#{1,6}(?:[ \t]+|$)/

/**
 * Remove the optional closing `#`s of an ATX heading: they must be preceded by
 * a space or tab, or be the whole content. Scanned by hand because the regex
 * form (`/[ \t]+#+[ \t]*$/`) is quadratic on long runs of spaces.
 */
function stripClosingSequence(s: string): string {
  let end = s.length
  while (end > 0 && isSpaceOrTab(s.charCodeAt(end - 1))) end--
  let hashes = end
  while (hashes > 0 && s.charCodeAt(hashes - 1) === 35) hashes--
  if (hashes === end) return s // no closing sequence
  let before = hashes
  while (before > 0 && isSpaceOrTab(s.charCodeAt(before - 1))) before--
  if (before === 0) return '' // only #s and spaces
  return before === hashes ? s : s.slice(0, before)
}

export const atxHeading: BlockRule = {
  name: 'atxHeading',
  triggers: '#',
  start(p) {
    const m = p.indented ? null : p.rest().match(reATXHeadingMarker)
    if (!m) return 0
    p.advanceNextNonspace()
    p.advanceOffset(m[0].length, false)
    p.closeUnmatchedBlocks()
    const b = p.addChild('heading', p.nextNonspace)
    b.node.depth = m[0].trim().length
    b.content = stripClosingSequence(p.line.slice(p.offset))
    p.advanceOffset(p.line.length - p.offset)
    return 2
  },
}

const reSetextHeadingLine = /^(?:=+|-+)[ \t]*$/

export const setextHeading: BlockRule = {
  name: 'setextHeading',
  triggers: '=-',
  start(p, container) {
    let m: RegExpMatchArray | null = null
    if (p.indented || container.type !== 'paragraph' || !(m = p.rest().match(reSetextHeadingLine))) return 0
    p.closeUnmatchedBlocks()
    consumeReferences(p, container)
    if (container.content.length === 0) return 0
    const b = new Block('heading', container.startLine)
    b.startColumn = container.startColumn
    b.node.depth = m[0][0] === '=' ? 1 : 2
    b.content = container.content
    container.replaceWith(b)
    p.tip = b
    p.advanceOffset(p.line.length - p.offset, false)
    return 2
  },
}

const reThematicBreak = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/

export const thematicBreak: BlockRule = {
  name: 'thematicBreak',
  triggers: '*_-',
  continue: () => 1,
  start(p) {
    if (p.indented || !reThematicBreak.test(p.rest())) return 0
    p.closeUnmatchedBlocks()
    p.addChild('thematicBreak', p.nextNonspace)
    p.advanceOffset(p.line.length - p.offset, false)
    return 2
  },
}

const reCodeFence = /^`{3,}(?!.*`)|^~{3,}/
const reClosingCodeFence = /^(?:`{3,}|~{3,})(?=[ \t]*$)/

export const code: BlockRule = {
  name: 'code',
  acceptsLines: true,
  continue(p, b) {
    const ln = p.line
    const indent = p.indent
    if (b.data.fenced) {
      const m = indent <= 3 && ln.charAt(p.nextNonspace) === b.data.fenceChar ? ln.slice(p.nextNonspace).match(reClosingCodeFence) : null
      if (m && m[0].length >= b.data.fenceLength) {
        p.finalize(b, p.lineNumber)
        return 2
      }
      // Remove up to the fence's own indentation from content lines.
      for (let i = b.data.fenceOffset; i > 0 && isSpaceOrTab(p.peek(p.offset)); i--) p.advanceOffset(1, true)
    } else if (indent >= CODE_INDENT) {
      p.advanceOffset(CODE_INDENT, true)
    } else if (p.blank) {
      p.advanceNextNonspace()
    } else {
      return 1
    }
    return 0
  },
  finalize(p, b) {
    if (b.data.fenced) {
      const nl = b.content.indexOf('\n')
      const info = p.unescape(trimMd(b.content.slice(0, nl)))
      const ws = info.search(/\s/)
      b.node.lang = (ws < 0 ? info : info.slice(0, ws)) || null
      b.node.meta = ws < 0 ? null : info.slice(ws).trim() || null
      b.node.value = b.content.slice(nl + 1)
    } else {
      const lines = b.content.split('\n')
      while (lines.length && /^[ \t]*$/.test(lines[lines.length - 1])) lines.pop()
      b.node.lang = null
      b.node.meta = null
      b.node.value = lines.join('\n') + '\n'
      b.endLine = b.startLine + lines.length - 1 // trailing blank lines are not part of the block
    }
    b.content = ''
  },
}

export const fencedCode: BlockRule = {
  name: 'fencedCode',
  triggers: '`~',
  start(p) {
    const m = p.indented ? null : p.rest().match(reCodeFence)
    if (!m) return 0
    p.closeUnmatchedBlocks()
    const b = p.addChild('code', p.nextNonspace)
    b.data.fenced = true
    b.data.fenceLength = m[0].length
    b.data.fenceChar = m[0][0]
    b.data.fenceOffset = p.indent
    p.advanceNextNonspace()
    p.advanceOffset(m[0].length, false)
    return 2
  },
}

export const indentedCode: BlockRule = {
  name: 'indentedCode',
  triggers: '', // only starts on indented lines, which bypass the trigger check
  start(p) {
    if (!p.indented || p.tip.type === 'paragraph' || p.blank) return 0
    p.advanceOffset(CODE_INDENT, true)
    p.closeUnmatchedBlocks()
    p.addChild('code', p.offset)
    return 2
  },
}

// HTML block kinds 1–7 from the spec: start condition and, for 1–5, end condition.
const reHtmlBlockOpen: RegExp[] = [
  /^$/,
  /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|[/]?[>]|$)/i,
  new RegExp(`^(?:${OPENTAG}|${CLOSETAG})\\s*$`, 'i'),
]
const reHtmlBlockClose: RegExp[] = [/^$/, /<\/(?:script|pre|textarea|style)>/i, /-->/, /\?>/, />/, /\]\]>/]

export const html: BlockRule = {
  name: 'html',
  acceptsLines: true,
  continue: (p, b) => (p.blank && b.data.kind >= 6 ? 1 : 0),
  finalize(_p, b) {
    // Drop trailing blank lines: same as /(\n *)+$/, which is quadratic.
    const s = b.content
    let end = s.length
    for (;;) {
      let i = end
      while (i > 0 && s.charCodeAt(i - 1) === 32) i--
      if (i > 0 && s.charCodeAt(i - 1) === 10) end = i - 1
      else break
    }
    b.node.value = s.slice(0, end)
    b.node.block = true
    b.content = ''
  },
}

export const htmlBlock: BlockRule = {
  name: 'htmlBlock',
  triggers: '<',
  start(p, container) {
    if (p.indented || p.peek(p.nextNonspace) !== C_LESSTHAN) return 0
    const s = p.rest()
    const lazy = !p.allClosed && !p.blank && p.tip.type === 'paragraph'
    for (let kind = 1; kind <= 7; kind++) {
      // Kind 7 cannot interrupt a paragraph (not even a lazy one).
      if (reHtmlBlockOpen[kind].test(s) && (kind < 7 || (container.type !== 'paragraph' && !lazy))) {
        p.closeUnmatchedBlocks()
        const b = p.addChild('html', p.offset) // leading spaces are part of the HTML
        b.data.kind = kind
        if (kind <= 5) {
          const end = reHtmlBlockClose[kind]
          b.data.closeOnLine = (line: string) => end.test(line)
        }
        return 2
      }
    }
    return 0
  },
}

/** Core rules. Rules with `start` are tried in this order. */
export const coreBlockRules: BlockRule[] = [
  root,
  paragraph,
  heading,
  code,
  html,
  list,
  blockquote,
  atxHeading,
  fencedCode,
  htmlBlock,
  setextHeading,
  thematicBreak,
  listItem,
  indentedCode,
]
