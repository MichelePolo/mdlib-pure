// Podcast sample plugin: copy into an application, import types from mdlib-pure.
// Syntax: @Name, [](time:M:SS[:CC]), [scheda](document name), [ ] / [x], _underline_.
// AST: podcastMention { name, tone }; podcastTime { centiseconds };
// podcastDocument { name }; podcastTask { checked, id, inlineOffset, inlineSource,
// blockLine? }; podcastInvalidTime { value }; podcastItem { checked, children };
// podcastWords / podcastUnderline { children }.
// HTML: mention/time spans, document buttons, checkbox buttons, underlined text.
// Ordinary links open a new browser tab with the core URL safety policy.
// Time is a planned duration, in integer centiseconds. No document loading here.
import { visit, type Node, type Plugin, type Root } from '../../src/index.ts'

export const PARTICIPANTS = ['Nora', 'Elio', 'Vera'] as const

/** M:SS or M:SS:CC. Bounded fields keep malformed inputs cheap and sums exact. */
export function parseDuration(value: string): number | null {
  const m = /^(\d{1,6}):([0-5]\d)(?::(\d{2}))?$/.exec(value)
  return m ? Number(m[1]) * 6000 + Number(m[2]) * 100 + Number(m[3] ?? 0) : null
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

export function podcast({ participants = PARTICIPANTS }: { participants?: readonly string[] } = {}): Plugin {
  const names = new Map(participants.map((name, tone) => [name.toLowerCase(), { name, tone: tone % 3 }]))
  return {
    name: 'podcast',
    delimiters: [{ char: '_', type: 'podcastUnderline', sizes: [1] }],
    inline: [{
      name: 'podcast-tags', triggers: '@[', before: 'openBracket',
      parse(p) {
        if (p.inBracket()) return false // no controls or metadata inside links/images
        if (p.peek() === 64) {
          if (p.pos && /[\p{L}\p{N}_.+%\-]/u.test(p.src[p.pos - 1])) return false
          const start = p.pos
          const token = p.match(/@[\p{L}\p{N}_-]{1,32}(?![\p{L}\p{N}_-])/uy)
          if (!token) return false
          const person = names.get(token.slice(1).toLowerCase())
          if (!person) { p.pos = start; return false }
          p.push({ type: 'podcastMention', ...person })
          return true
        }
        if (p.src.startsWith('[](time:', p.pos)) {
          const token = p.match(/\[\]\(time:[^\r\n)]{0,32}\)/y)
          if (!token) { p.pos += 8; p.text('[](time:'); return true }
          const centiseconds = parseDuration(token.slice(8, -1))
          p.push(centiseconds === null ? { type: 'podcastInvalidTime', value: token } : { type: 'podcastTime', centiseconds })
          return true
        }
        if (p.src.startsWith('[scheda](', p.pos)) {
          const token = p.match(/\[scheda\]\([^()\x00-\x1f\\]{1,160}\)/y)
          if (!token) { p.pos += 9; p.text('[scheda]('); return true }
          // Also accept the doc: prefix used by the original editor's placeholder.
          const name = token.slice(9, -1).replace(/^doc:/, '').trim()
          if (name) p.push({ type: 'podcastDocument', name })
          else p.text(token)
          return true
        }
        const inlineOffset = p.pos
        const token = p.match(/\[[ xX]\](?=[ \t\n]|$)/y)
        if (!token) return false
        p.push({ type: 'podcastTask', checked: token[1] !== ' ', inlineOffset, inlineSource: p.src })
        return true
      },
    }],
    transform(root) {
      let id = 0
      // Per-document IDs and source locations: never state on the shared plugin.
      const locate = (n: Node, blockLine?: number): void => {
        if (n.type === 'paragraph' || n.type === 'heading') blockLine = n.position?.start.line
        if (n.type === 'podcastTask') { n.id = id++; n.blockLine = blockLine }
        for (const child of n.children ?? []) locate(child, blockLine)
        if (n.type !== 'paragraph' || !n.children?.some((c) => c.type === 'podcastTask')) return
        // A checked item strikes only its own line/segment, leaving badges clear.
        const out: Node[] = []
        let item: Node | null = null
        const append = (child: Node): void => {
          if (!item) out.push(child)
          else item.children!.push(child.type.startsWith('podcast') ? child : { type: 'podcastWords', children: [child] })
        }
        for (const child of n.children) {
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
      podcastTime: (n, r) => r.h('span', { class: 'podcast-time', title: `Durata prevista: ${formatDuration(n.centiseconds as number)}` }, '◷ ', durationLabel(n.centiseconds as number)),
      podcastInvalidTime: (n, r) => r.h('span', { class: 'podcast-invalid', title: 'Durata non valida: usa minuti:secondi:centesimi' }, n.value as string),
      podcastDocument: (n, r) => r.h('button', { type: 'button', class: 'podcast-document', 'data-document': n.name as string, 'aria-label': `Apri scheda: ${n.name}` }, '▤ ', n.name as string, ' ↗'),
      podcastTask: (n, r) => r.h('button', { type: 'button', role: 'checkbox', class: 'podcast-check', 'data-task': n.id as number, 'aria-checked': String(n.checked), 'aria-label': n.checked ? 'Segna intervento da completare' : 'Completa intervento', disabled: true }, n.checked ? '✓' : ''),
      podcastItem: (n, r) => r.h('span', { class: `podcast-item${n.checked ? ' is-complete' : ''}` }, r.children(n)),
      podcastWords: (n, r) => r.h('span', { class: 'podcast-words' }, r.children(n)),
      podcastUnderline: (n, r) => r.h('u', null, r.children(n)),
    },
  }
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
    if (/^\[[ xX]\]$/.test(source.slice(start, start + 3))) ranges.set(n.id as number, [start, start + 3])
  })
  return ranges
}
