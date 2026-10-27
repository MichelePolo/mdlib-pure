// Container directives: fenced blocks of Markdown with a kind and a title.
//
//   ::: warning Optional title
//   Any **block** content: paragraphs, lists, code, nested blockquotes.
//   :::
//
//   createMarkdown({ plugins: [container()] })
//
// Syntax. The opener is 3+ colons, a kind (ASCII letters) and an optional
// title; the closer is a line of at least as many colons. Both may be indented
// up to 3 spaces. A closer belongs to the innermost open container it is long
// enough for, and only if no block in between claimed the line (a `>` or list
// indentation, or a fenced code block whose content it is). Nest by using more
// colons outside (`:::: outer` … `::: inner` … `:::` … `::::`). An unclosed
// container ends with its parent, like an unclosed code fence.
//
// AST: `container { kind, title, children }` (see `Container`).
// HTML: <div class="md-container md-container-KIND">, then
// <p class="md-container-title">TITLE</p> when there is a title.

import { type Block, type BlockParser, MAX_NESTING } from '../block/parser.ts'
import type { BlockRule, Parent, Plugin, StartResult } from '../types.ts'
import { C_COLON, isSpaceOrTab, trimMd } from '../util/common.ts'

export interface Container extends Parent {
  type: 'container'
  /** The word after the colons, lowercased. */
  kind: string
  /** Rest of the opening line, trimmed, escapes and entities resolved; `null` if empty. */
  title: string | null
}

interface Scan {
  line: number
  pos: number
  /** Length of the colon run, 0 if shorter than 3. */
  colons: number
  /** Only spaces and tabs follow the colons. */
  closer: boolean
}

/**
 * Scan the colon fence at the first non-space. Memoized per line and
 * position: every open container asks, so nesting must not multiply the work.
 */
function scan(p: BlockParser): Scan {
  const s = (p.env['container:scan'] ??= { line: 0, pos: -1, colons: 0, closer: false }) as Scan
  if (s.line === p.lineNumber && s.pos === p.nextNonspace) return s
  const line = p.line
  let i = (s.pos = p.nextNonspace)
  s.line = p.lineNumber
  while (line.charCodeAt(i) === C_COLON) i++
  s.colons = i - s.pos >= 3 ? i - s.pos : 0
  while (isSpaceOrTab(line.charCodeAt(i))) i++
  s.closer = s.colons > 0 && i >= line.length
  return s
}

/** Close the innermost container that took this line as its closer (see `continue`). */
function close(p: BlockParser, from: Block): StartResult {
  let b: Block | null = from
  while (b && !(b.type === 'container' && b.data.closeLine === p.lineNumber && b.data.closeOffset === p.offset)) b = b.parent
  if (!b) return 0
  p.closeUnmatchedBlocks()
  b.data.closed = true // finalize also closes open children, on the previous line
  p.finalize(b, p.lineNumber)
  p.advanceOffset(p.line.length - p.offset)
  return 2 // nothing was opened, but 2 stops further block starts on this line
}

const reKind = /[ \t]*([A-Za-z]+)(?=[ \t]|$)/y

const rule: BlockRule = {
  name: 'container',
  triggers: ':',
  // Ahead of rules appended without an anchor, e.g. GFM table rows, which
  // have no triggers and would take the closing line as a row.
  before: 'fencedCode',
  content: 'block',
  canContain: (t) => t !== 'listItem',
  // A closer is only *recorded* here: open children see the line next, so
  // fenced code inside keeps its `:::` lines. `start` does the closing.
  continue(p, b) {
    const s = p.indented ? null : scan(p)
    if (s?.closer && s.colons >= b.data.fence) {
      b.data.closeLine = p.lineNumber
      b.data.closeOffset = p.offset
    }
    return 0
  },
  start(p, parent) {
    const s = p.indented ? null : scan(p)
    if (!s?.colons) return 0
    if (s.closer) return close(p, parent)
    reKind.lastIndex = p.nextNonspace + s.colons
    const m = parent.depth < MAX_NESTING ? reKind.exec(p.line) : null
    if (!m) return 0
    p.closeUnmatchedBlocks()
    const b = p.addChild('container', p.nextNonspace)
    b.data.fence = s.colons
    b.node.kind = m[1].toLowerCase()
    b.node.title = p.unescape(trimMd(p.line.slice(reKind.lastIndex))) || null
    p.advanceOffset(p.line.length - p.offset)
    return 1
  },
  finalize(_p, b) {
    // Unclosed: end at the last child, so trailing blank lines can loosen a list.
    if (!b.data.closed) b.endLine = b.lastChild ? b.lastChild.endLine : b.startLine
  },
}

export const container = (): Plugin => ({
  name: 'container',
  block: [rule],
  render: {
    container: (n, r) =>
      r.h('div', { class: `md-container md-container-${n.kind}` }, n.title ? r.h('p', { class: 'md-container-title' }, n.title as string) : null, r.children(n)),
  },
})
