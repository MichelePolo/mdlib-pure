// Podcast sample plugin: copy into an application, import types from mdlib-pure.
// Syntax: @Name, [titolo](time:…), [scheda](document name) / [titolo](doc:name), [ ] / [x],
// _underline_; with options: #topic and free @name tags with colours, "clock" durations
// (m:ss, h:mm:ss, 5m, 90s), one line = one block, loose checkboxes ("[]", "-[]").
// AST: podcastMention { name, tone }; podcastTag { prefix, name, color, text, defined };
// podcastTime { centiseconds, title, line, index }; podcastDocument { name, title };
// podcastTask { checked, id, line, box, inlineOffset, inlineSource, blockLine? };
// podcastInvalidTime { value }; podcastItem { checked, children }; podcastWords /
// podcastUnderline { children }. Blocks that hold tasks get podcastTasks / podcastDone.
// HTML: mention/tag/time spans, document buttons, checkbox buttons, underlined text.
// Ordinary links open a new browser tab with the core URL safety policy.
// Time is a planned duration, in integer centiseconds. No document loading here.
import { visit, type Node, type Plugin, type Root } from '../../src/index.ts'

export const PARTICIPANTS = ['Nora', 'Elio', 'Vera'] as const

export interface PodcastTagOptions {
  /** `participants` (default): only configured names become badges. `any`: every @name is a coloured tag. */
  mentions?: 'participants' | 'any'
  /** Recognize `#topic` tags (coloured like `@name`: the colour depends on the name only). Default false. */
  hashtags?: boolean
  /** Fixed colours by tag name, compared ignoring case (e.g. the participants' profile colours). */
  colors?: Record<string, string> | ReadonlyMap<string, string>
}

export interface PodcastOptions {
  participants?: readonly string[]
  /**
   * How time values read. `centiseconds` (default): `M:SS[:CC]`. `clock`: `m:ss`, `h:mm:ss`, `5m`, `90s`,
   * `2m30s`, from 1 s to 10 h, and the chip shows the title and a clock (`⏱ titolo 04:30`).
   */
  durations?: 'centiseconds' | 'clock'
  tags?: PodcastTagOptions
  /** One source line = one block: soft line breaks split paragraphs; setext headings and indented code are off. */
  lineBlocks?: boolean
  /** Also accept `[]`, `[ x ]`, a box not followed by whitespace, and list markers glued to a box (`-[]`, `1.[]`). */
  looseTasks?: boolean
}

/** M:SS or M:SS:CC. Bounded fields keep malformed inputs cheap and sums exact. */
export function parseDuration(value: string): number | null {
  const m = /^(\d{1,6}):([0-5]\d)(?::(\d{2}))?$/.exec(value)
  return m ? Number(m[1]) * 6000 + Number(m[2]) * 100 + Number(m[3] ?? 0) : null
}

/** `4:30`, `04:30`, `1:05:00`, `5m`, `90s`, `2m30s` → seconds, or null when it is not a duration (1 s .. 10 h). */
export function parseClock(value: string): number | null {
  const m = /^(?:(?:(\d{1,2}):)?(\d{1,3}):(\d{2})|(\d{1,3})m(?:(\d{1,2})s)?|(\d{1,5})s)$/.exec(value.trim())
  if (!m) return null
  const n = (s: string | undefined): number => (s === undefined ? 0 : Number(s))
  let seconds: number
  if (m[2] !== undefined) {
    if (n(m[3]) > 59 || (m[1] !== undefined && n(m[2]) > 59)) return null
    seconds = n(m[1]) * 3600 + n(m[2]) * 60 + n(m[3])
  } else seconds = n(m[4]) * 60 + n(m[5]) + n(m[6])
  return seconds >= 1 && seconds <= 36000 ? seconds : null
}

/** `04:30`, `1:05:00`: the clock of a duration in seconds. */
export function formatClock(seconds: number): string {
  const two = (v: number): string => String(v).padStart(2, '0')
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${two(Math.floor(seconds / 60) % 60)}:${two(seconds % 60)}` : `${two(Math.floor(seconds / 60))}:${two(seconds % 60)}`
}

export function formatDuration(value: number): string {
  return `${Math.floor(value / 6000)}:${String(Math.floor(value / 100) % 60).padStart(2, '0')}:${String(value % 100).padStart(2, '0')}`
}

export function durationLabel(value: number): string {
  const minutes = Math.floor(value / 6000)
  const seconds = Math.floor(value / 100) % 60
  const fraction = value % 100
  return `${minutes} min${seconds || fraction ? ` ${seconds}${fraction ? `,${String(fraction).padStart(2, '0')}` : ''} s` : ''}`
}

export function getPodcastSummary(root: Root): { centiseconds: number; tasks: number; completed: number; invalid: number } {
  const summary = { centiseconds: 0, tasks: 0, completed: 0, invalid: 0 }
  visit(root, (n) => {
    if (n.type === 'podcastTime') summary.centiseconds += n.centiseconds as number
    if (n.type === 'podcastInvalidTime') summary.invalid++
    if (n.type === 'podcastTask') { summary.tasks++; if (n.checked) summary.completed++ }
  })
  return summary
}

// --- Tag colours (the same function as the studio server: the same name gives the same colour everywhere) ---------

const NAMED_COLORS = new Map(Object.entries({
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4', azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4',
  black: '#000000', blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a', burlywood: '#deb887', cadetblue: '#5f9ea0',
  chartreuse: '#7fff00', chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff',
  darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b', darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b', darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000', darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f', darkslateblue: '#483d8b', darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3',
  deeppink: '#ff1493', deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0',
  forestgreen: '#228b22', fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520', gray: '#808080',
  green: '#008000', greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c', indigo: '#4b0082',
  ivory: '#fffff0', khaki: '#f0e68c', lavender: '#e6e6fa', lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3', lightgreen: '#90ee90', lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1', lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000',
  mediumaquamarine: '#66cdaa', mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a', mediumturquoise: '#48d1cc', mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500',
  orangered: '#ff4500', orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093',
  papayawhip: '#ffefd5', peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080',
  rebeccapurple: '#663399', red: '#ff0000', rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460',
  seagreen: '#2e8b57', seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090',
  slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8',
  tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
}))

/** `#rrggbb` for a hex value (3 or 6 digits, `#` optional) or a CSS named colour, ignoring case; null otherwise. */
export function cssColor(value: string): string | null {
  const v = value.trim().toLowerCase()
  const named = NAMED_COLORS.get(v)
  if (named) return named
  const hex = v.startsWith('#') ? v.slice(1) : v
  if (!/^(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(hex)) return null
  return `#${hex.length === 3 ? hex.replace(/./g, '$&$&') : hex}`
}

// .NET Math.Round: halves go to the even neighbour.
const roundEven = (v: number): number => { const r = Math.round(v); return Math.abs(v % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r }
function hslHex(hue: number, s: number, l: number): string {
  const f = (n: number): number => { const k = (n + hue / 30) % 12; const a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)) }
  const hex = (v: number): string => roundEven(v * 255).toString(16).padStart(2, '0')
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`
}

/**
 * Fixed colour when there is one (names compare ignoring case), otherwise a hue from a hash of the name
 * (FNV-1a, mixed) at one of three lightness levels: the same tag always gets the same colour.
 */
export function tagColor(name: string, colors?: Record<string, string> | ReadonlyMap<string, string> | null): string {
  const fixed = lookup(colors, name)
  if (fixed) return fixed
  const lower = name.toLowerCase()
  let h = 2166136261
  for (let i = 0; i < lower.length; i++) h = Math.imul(h ^ lower.charCodeAt(i), 16777619) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return hslHex(h % 360, 0.65, 0.38 + ((h >>> 9) % 3) * 0.09)
}

/** Black or white text for a chip, by the relative luminance of its background (`#rrggbb`). */
export function tagTextColor(hex: string): string {
  const channel = (at: number): number => { const c = parseInt(hex.slice(at, at + 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5) > 0.35 ? '#111' : '#fff'
}

// "#nome" / "@nome": a letter first, then letters, digits, "_" and "-" (bounded); optional "(color:…)".
const TAG = /([#@])(\p{L}[\p{L}\p{N}_-]{0,63})(\((?:color):(#?[0-9a-z]{1,20})\))?/iuy
const TAG_BOUNDARY = /[\p{L}\p{N}_#&@]/u

/** Colours fixed with `#nome(color:…)` / `@nome(color:…)` in the texts, by lower-case name; the first definition wins. */
export function tagColors(...texts: Array<string | null | undefined>): Map<string, string> {
  const colors = new Map<string, string>()
  const re = new RegExp(TAG.source, 'iug')
  for (const text of texts) {
    if (!text) continue
    for (let m: RegExpExecArray | null; (m = re.exec(text));) {
      if (m.index && TAG_BOUNDARY.test(text[m.index - 1])) continue
      const hex = m[4] === undefined ? null : cssColor(m[4])
      if (hex && !colors.has(m[2].toLowerCase())) colors.set(m[2].toLowerCase(), hex)
    }
  }
  return colors
}

function lookup(colors: Record<string, string> | ReadonlyMap<string, string> | null | undefined, name: string): string | null {
  if (!colors) return null
  const lower = name.toLowerCase()
  if (colors instanceof Map) return colors.get(lower) ?? colors.get(name) ?? null
  for (const key of Object.keys(colors)) if (key.toLowerCase() === lower) return (colors as Record<string, string>)[key]
  return null
}

// --- The plugin -------------------------------------------------------------------------------------------------

const TASK_STRICT = /\[[ xX]\](?=[ \t\n]|$)/y
const TASK_LOOSE = /\[[ \t]{0,3}[xX]?[ \t]{0,3}\](?!\()/y
const TAGGED_LINK = /\[([^[\]\n]{0,160})\]\((time|doc):([^()\n]{0,160})\)/iy
const GLUED_MARKER = /^([-*+]|\d{1,9}[.)])(?=\[[ \t]{0,3}[xX]?[ \t]{0,3}\])/

export function podcast({ participants = PARTICIPANTS, durations = 'centiseconds', tags = {}, lineBlocks = false, looseTasks = false }: PodcastOptions = {}): Plugin {
  const names = new Map(participants.map((name, tone) => [name.toLowerCase(), { name, tone: tone % 3 }]))
  const anyMention = tags.mentions === 'any'
  const colors = tags.colors ?? null
  const clock = durations === 'clock'
  const tagNode = (prefix: string, name: string, own: string | null): Node => {
    const color = lookup(colors, name) ?? own ?? tagColor(name)
    return { type: 'podcastTag', prefix, name, color, text: tagTextColor(color), defined: own !== null }
  }
  const block: NonNullable<Plugin['block']> = []
  if (lineBlocks) block.push({ name: 'setextHeading', start: () => 0 }, { name: 'indentedCode', start: () => 0 })
  if (looseTasks) block.push({
    // "-[]" / "1.[]": a list marker glued to a box is a list item (the core wants a space after the marker).
    name: 'podcast-glued-marker', before: 'listItem', triggers: '-*+0123456789',
    start(p, container) {
      if (p.indented) return 0
      const m = GLUED_MARKER.exec(p.line.slice(p.nextNonspace, p.nextNonspace + 16))
      if (!m) return 0
      const at = p.nextNonspace + m[1].length
      p.line = `${p.line.slice(0, at)} ${p.line.slice(at)}`
      return p.rule('listItem').start!(p, container)
    },
  })
  return {
    name: 'podcast',
    block,
    delimiters: [{ char: '_', type: 'podcastUnderline', sizes: [1] }],
    inline: [{
      name: 'podcast-tags', triggers: `@[${tags.hashtags ? '#' : ''}`, before: 'openBracket',
      parse(p) {
        if (p.inBracket()) return false // no controls or metadata inside links/images
        const first = p.peek()
        if (first === 64 || first === 35) {
          const start = p.pos
          if (anyMention || first === 35) {
            if (start && TAG_BOUNDARY.test(p.src[start - 1])) return false
            const token = p.match(TAG)
            if (!token) return false
            TAG.lastIndex = 0
            const [, prefix, name, def, color] = TAG.exec(token)!
            const own = def === undefined ? null : cssColor(color)
            p.push(tagNode(prefix, name, own))
            if (def !== undefined && own === null) p.text(def) // an unknown colour stays as typed
            return true
          }
          if (start && /[\p{L}\p{N}_.+%\-]/u.test(p.src[start - 1])) return false
          const token = p.match(/@[\p{L}\p{N}_-]{1,32}(?![\p{L}\p{N}_-])/uy)
          if (!token) return false
          const person = names.get(token.slice(1).toLowerCase())
          if (!person) { p.pos = start; return false }
          p.push({ type: 'podcastMention', ...person })
          return true
        }
        if (p.src.startsWith('[scheda](', p.pos)) {
          const token = p.match(/\[scheda\]\([^()\x00-\x1f\\]{1,160}\)/y)
          if (!token) { p.pos += 9; p.text('[scheda]('); return true }
          // Also accept the doc: prefix used by the original editor's placeholder.
          const name = token.slice(9, -1).replace(/^doc:/, '').trim()
          if (name) p.push({ type: 'podcastDocument', name, title: '' })
          else p.text(token)
          return true
        }
        const tagged = p.match(TAGGED_LINK)
        if (tagged) {
          TAGGED_LINK.lastIndex = 0
          const [, label, kind, value] = TAGGED_LINK.exec(tagged)!
          const title = label.trim()
          if (kind.toLowerCase() === 'doc') {
            const name = value.trim()
            if (name && !/[\\\x00-\x1f]/.test(name)) p.push({ type: 'podcastDocument', name, title })
            else p.text(tagged)
            return true
          }
          if (clock) {
            const seconds = parseClock(value)
            p.push(seconds === null ? { type: 'podcastInvalidTime', value: tagged } : { type: 'podcastTime', centiseconds: seconds * 100, title })
          } else {
            const centiseconds = parseDuration(value.trim())
            p.push(centiseconds === null ? { type: 'podcastInvalidTime', value: tagged } : { type: 'podcastTime', centiseconds, title })
          }
          return true
        }
        // An unterminated time tag is plain text up to the next trigger, never a link.
        if (p.src.startsWith('[](time:', p.pos)) { p.pos += 8; p.text('[](time:'); return true }
        if (looseTasks && p.pos && !/\s/.test(p.src[p.pos - 1])) return false
        const inlineOffset = p.pos
        const token = p.match(looseTasks ? TASK_LOOSE : TASK_STRICT)
        if (!token) return false
        p.push({ type: 'podcastTask', checked: /[xX]/.test(token), inlineOffset, inlineSource: p.src })
        return true
      },
    }],
    transform(root) {
      if (lineBlocks) splitLines(root, false)
      let id = 0
      // Per-document IDs and source locations: never state on the shared plugin.
      const locate = (n: Node, blockLine?: number): void => {
        if (n.type === 'paragraph' || n.type === 'heading') blockLine = (n.podcastSourceLine as number | undefined) ?? n.position?.start.line
        if (n.type === 'podcastTask') { n.id = id++; n.blockLine = blockLine }
        for (const child of n.children ?? []) locate(child, blockLine)
        if (n.type !== 'paragraph' && n.type !== 'heading') return
        // Source line (0-based) and ordinal on that line of every task and timer: what a host needs to toggle
        // "line, box" or to mark the running timer. Tasks know their offset in the inline source.
        const counts = new Map<string, number>()
        const base = (blockLine ?? 1) - 1
        let line = base, taskLine = base, source: string | null = null, previous = 0
        for (const child of n.children ?? []) {
          if (child.type === 'podcastTask') {
            // Absolute: newlines of the inline source before the task (a hard break may stand for one of them).
            const text = child.inlineSource as string, pos = child.inlineOffset as number
            if (text !== source || pos < previous) { source = text; previous = 0; taskLine = base }
            for (let i = previous; i < pos; i++) if (text.charCodeAt(i) === 10) taskLine++
            previous = pos
            line = taskLine
          } else if (child.type === 'text' && (child.value as string).includes('\n')) { line += (child.value as string).split('\n').length - 1; continue }
          else if (child.type === 'break') { line++; continue }
          if (child.type !== 'podcastTask' && child.type !== 'podcastTime') continue
          const key = `${child.type}:${line}`
          const ordinal = counts.get(key) ?? 0
          counts.set(key, ordinal + 1)
          child.line = line
          if (child.type === 'podcastTask') child.box = ordinal
          else child.index = ordinal
        }
        const tasks = (n.children ?? []).filter((c) => c.type === 'podcastTask')
        if (tasks.length) { n.podcastTasks = tasks.length; n.podcastDone = tasks.every((t) => t.checked) }
        if (n.type !== 'paragraph' || !tasks.length) return
        // A checked item strikes only its own line/segment, leaving badges clear.
        const out: Node[] = []
        let item: Node | null = null
        const append = (child: Node): void => {
          if (!item) out.push(child)
          else item.children!.push(child.type.startsWith('podcast') ? child : { type: 'podcastWords', children: [child] })
        }
        for (const child of n.children!) {
          if (child.type === 'podcastTask') {
            item = { type: 'podcastItem', checked: child.checked, children: [child] }
            out.push(item)
          } else if (child.type === 'text' && (child.value as string).includes('\n')) {
            const lines = (child.value as string).split('\n')
            for (let i = 0; i < lines.length; i++) {
              if (i) { out.push({ type: 'break' }); item = null }
              if (lines[i]) append({ type: 'text', value: lines[i] })
            }
          } else if (child.type === 'break') { out.push(child); item = null }
          else append(child)
        }
        n.children = out
      }
      locate(root)
    },
    render: {
      link: (n, r) => r.h('a', { href: r.url(n.url as string, 'link'), title: n.title as string | null, target: '_blank', rel: 'noopener noreferrer' }, r.children(n)),
      podcastMention: (n, r) => r.h('span', { class: `podcast-mention podcast-person-${n.tone}` }, `@${n.name}`),
      podcastTag: (n, r) => r.h('span', { class: 'podcast-tag', style: `background:${n.color};color:${n.text}`, 'data-tag': (n.name as string).toLowerCase(), title: n.defined ? 'Colore fissato qui per tutta la puntata' : null }, `${n.prefix}${n.name}`),
      podcastTime: (n, r) => {
        const title = (n.title as string | undefined) || ''
        const at = { 'data-line': n.line as number | undefined, 'data-timer': n.index as number | undefined }
        if (clock) return r.h('span', { class: 'podcast-time', ...at, title: 'Parte quando questo punto diventa quello corrente e conta solo in registrazione' }, '⏱ ', title ? `${title} ` : '', formatClock((n.centiseconds as number) / 100))
        return r.h('span', { class: 'podcast-time', ...at, title: `Durata prevista: ${formatDuration(n.centiseconds as number)}` }, '◷ ', title ? `${title} ` : '', durationLabel(n.centiseconds as number))
      },
      podcastInvalidTime: (n, r) => r.h('span', { class: 'podcast-invalid', title: clock ? 'Durata non valida: usa minuti:secondi, ore:minuti:secondi, 5m o 90s' : 'Durata non valida: usa minuti:secondi:centesimi' }, n.value as string),
      podcastDocument: (n, r) => r.h('button', { type: 'button', class: 'podcast-document', 'data-document': n.name as string, 'data-title': (n.title as string) || (n.name as string), 'aria-label': `Apri scheda: ${n.name}` }, '▤ ', (n.title as string) || (n.name as string), (n.title as string) ? '' : ' ↗'),
      podcastTask: (n, r) => r.h('button', { type: 'button', role: 'checkbox', class: 'podcast-check', 'data-task': n.id as number, 'data-line': n.line as number | undefined, 'data-box': n.box as number | undefined, 'aria-checked': String(n.checked), 'aria-label': n.checked ? 'Segna intervento da completare' : 'Completa intervento', disabled: true }, n.checked ? '✓' : ''),
      podcastItem: (n, r) => r.h('span', { class: `podcast-item${n.checked ? ' is-complete' : ''}` }, r.children(n)),
      podcastWords: (n, r) => r.h('span', { class: 'podcast-words' }, r.children(n)),
      podcastUnderline: (n, r) => r.h('u', null, r.children(n)),
    },
  }
}

/**
 * One line = one block: a paragraph with soft breaks becomes one paragraph per line (each with the line it
 * came from in `position`, and `podcastSourceLine` = the line of the original paragraph, which `inlineOffset`
 * of its tasks still refers to). Inside tight list items the lines stay in one item, on separate rows.
 */
function splitLines(parent: Node, tight: boolean): void {
  const children = parent.children
  if (!children) return
  const out: Node[] = []
  for (const child of children) {
    if (child.type !== 'paragraph' || !child.children?.some((c) => (c.type === 'text' && (c.value as string).includes('\n')) || c.type === 'break')) {
      if (child.children) splitLines(child, child.type === 'listItem' ? child.spread !== true : child.type === 'list' ? tight : false)
      out.push(child)
      continue
    }
    const groups: Node[][] = [[]]
    for (const c of child.children) {
      if (c.type === 'break') { groups.push([]); continue }
      if (c.type !== 'text' || !(c.value as string).includes('\n')) { groups[groups.length - 1].push(c); continue }
      const lines = (c.value as string).split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (i) groups.push([])
        if (lines[i]) groups[groups.length - 1].push({ type: 'text', value: lines[i] })
      }
    }
    if (tight) {
      // One row per line inside the item: hard breaks between the lines.
      child.children = groups.flatMap((g, i) => (i ? [{ type: 'break' }, ...g] : g))
      out.push(child)
      continue
    }
    const first = child.position?.start.line
    groups.forEach((g, i) => {
      const node: Node = { ...child, children: g }
      if (child.position && first !== undefined) {
        node.position = { start: { ...child.position.start, line: first + i, column: i ? 1 : child.position.start.column }, end: { ...child.position.end, line: first + i } }
        node.podcastSourceLine = first
      }
      out.push(node)
    })
  }
  parent.children = out
}

/** Exact editable checkbox ranges, using positions:true. Unsupported transformed
 * content (e.g. a table cell without a paragraph position) stays read-only.
 * Inline offsets refer to parser text, so map through source lines rather than
 * searching all `[x]` strings (which would also toggle code or escaped markers).
 */
export function taskRanges(source: string, root: Root): Map<number, [number, number]> {
  const ranges = new Map<number, [number, number]>()
  const lines = source.split(/\r\n|\n|\r/)
  const offsets = [0]
  const ends = /\r\n|\n|\r/g
  for (let m; (m = ends.exec(source));) offsets.push(ends.lastIndex)
  const cursors = new Map<string, { start: number; next: number; line: number; previous: number }>()
  const mappedLines = new Map<string, Map<number, number>>()
  visit(root, (n) => {
    if (n.type !== 'podcastTask' || typeof n.blockLine !== 'number') return
    const text = n.inlineSource as string
    const pos = n.inlineOffset as number
    let cursor = cursors.get(text)
    if (!cursor || pos < cursor.previous) { cursor = { start: 0, next: text.indexOf('\n'), line: 0, previous: 0 }; cursors.set(text, cursor) }
    while (cursor.next >= 0 && cursor.next < pos) { cursor.start = cursor.next + 1; cursor.line++; cursor.next = text.indexOf('\n', cursor.start) }
    cursor.previous = pos
    const lineIndex = n.blockLine - 1 + cursor.line
    let mapped = mappedLines.get(text)
    if (!mapped) { mapped = new Map(); mappedLines.set(text, mapped) }
    let at = mapped.get(lineIndex)
    if (at === undefined) {
      const fragment = text.slice(cursor.start, cursor.next < 0 ? text.length : cursor.next)
      const raw = lines[lineIndex] ?? ''
      at = raw.indexOf(fragment)
      if (at !== raw.lastIndexOf(fragment)) at = -1
      mapped.set(lineIndex, at)
    }
    if (at < 0) return
    const start = offsets[lineIndex] + at + pos - cursor.start
    const box = /^\[[ \t]{0,3}[xX]?[ \t]{0,3}\]/.exec(source.slice(start, start + 9))
    if (box) ranges.set(n.id as number, [start, start + box[0].length])
  })
  return ranges
}
