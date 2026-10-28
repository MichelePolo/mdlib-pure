// Definition lists (PHP Markdown Extra / Pandoc style).
//
//   Term
//   : Definition, lazy continuation lines allowed
//   : Second definition
//
//   Term A
//   Term B
//   :   Definition with block content
//
//       Second paragraph, indented to the content column.
//
//   createMarkdown({ plugins: [deflist()] })
//
// Syntax. A marker is `:` followed by spaces or a tab and some content,
// indented up to 3 spaces. Right after a paragraph (in the same container,
// not a lazy line) it turns each line of the paragraph into a term and opens
// a definition: a container like a list item, whose continuation lines are
// indented to the content column (after `:` and its spaces; with 5+ spaces
// the content is indented code and the column is `:` + 1). A non-indented
// line continues the definition's paragraph lazily, so another group of terms
// starts after a blank line (or after a definition ending in a block that
// takes no lazy lines, like a heading). Consecutive groups form one list; a
// paragraph after the list that no marker follows stays a paragraph.
// - One blank line may separate the terms and their first marker (Pandoc).
// - Link reference definitions at the start of the paragraph are not terms.
// - A paragraph whose first line looks like a marker (`:` and a space, tab or
//   line end) never becomes terms: runs of `: x` lines stay text.
// - A marker at a definition's content column belongs to that definition
//   (nesting, like `- a` / `  - b`). Depth is capped at MAX_NESTING.
// Loose: like CommonMark lists, the whole list is loose (definitions keep
// their <p>) if a blank line separates terms from their first definition,
// two definitions, or two blocks inside a definition. Blank lines between
// groups (a definition and the next terms) are separators and do not count.
//
// AST: `definitionList { spread }` > `definitionTerm` (inline children) and
// `definitionDescription { spread }` (block children; `spread` mirrors the
// list's, like `listItem`).
// HTML: <dl>\n<dt>Term</dt>\n<dd>Definition</dd>\n</dl>\n; loose:
// <dd>\n<p>Definition</p>\n</dd>. Tight paragraphs come from the core rule
// "a parent with `spread: false` renders paragraphs without <p>".

import { Block, type BlockParser, MAX_NESTING } from '../block/parser.ts'
import type { BlockRule, Node, Plugin } from '../types.ts'
import { C_COLON, C_OPEN_BRACKET, isSpaceOrTab } from '../util/common.ts'

const DL = 'definitionList'
const DT = 'definitionTerm'
const DD = 'definitionDescription'

/** The line is a marker: `:`, a space or tab, then content. */
function isMarker(p: BlockParser): boolean {
  const line = p.line
  let i = p.nextNonspace
  if (p.indented || line.charCodeAt(i) !== C_COLON || !isSpaceOrTab(line.charCodeAt(i + 1))) return false
  i += 2
  while (isSpaceOrTab(line.charCodeAt(i))) i++
  return i < line.length
}

/** A paragraph starting like a marker never becomes terms. */
const reMarkerLike = /^:(?:[ \t\n]|$)/

const isPart = (b: Block): boolean => b.type === DT || b.type === DD
const gap = (a: Block, b: Block): boolean => a.endLine !== b.startLine - 1

const listRule: BlockRule = {
  name: DL,
  content: 'block',
  // A paragraph after the last definition is a term candidate (see `start`).
  canContain: (t) => t === DD || t === 'paragraph',
  continue(p, b) {
    const last = b.lastChild!
    if (isPart(last)) return 0
    // A candidate closed by a blank line waits for one marker line only; a
    // block that replaced it (setext heading) is never terms.
    return last.type === 'paragraph' && (last.open || (isMarker(p) && !reMarkerLike.test(last.content))) ? 0 : 1
  },
  finalize(_p, b) {
    const kids = b.children
    // A candidate that no marker followed leaves the list. The list is open,
    // so it is the last child of its parent.
    let n = kids.length
    while (!isPart(kids[n - 1])) n--
    if (n < kids.length) {
      const parent = b.parent!
      const out = kids.splice(n)
      for (const c of out) {
        c.parent = parent
        c.depth = b.depth
      }
      parent.children.splice(parent.children.lastIndexOf(b) + 1, 0, ...out)
    }
    let loose = false
    for (let i = 1; i < n && !loose; i++) {
      const dd = kids[i]
      // dd → dt (between groups) is not checked: that blank line is required.
      loose = dd.type === DD && (gap(kids[i - 1], dd) || dd.children.some((c, j) => j > 0 && gap(dd.children[j - 1], c)))
    }
    b.node.spread = loose
    for (const c of kids) if (c.type === DD) c.node.spread = loose
    b.endLine = kids[n - 1].endLine
  },
}

const descriptionRule: BlockRule = {
  name: DD,
  triggers: ':',
  // Anchored ahead of rules appended without one (GFM table rows).
  before: 'fencedCode',
  content: 'block',
  canContain: (t) => t !== 'listItem',
  continue(p, b) {
    if (p.blank) {
      if (!b.children.length) return 1
      p.advanceNextNonspace()
    } else if (p.indent >= b.data.indent) {
      p.advanceOffset(b.data.indent, true)
    } else {
      return 1
    }
    return 0
  },
  finalize(_p, b) {
    // Trailing blank lines belong to no one (as for list items).
    b.endLine = b.lastChild ? b.lastChild.endLine : b.startLine
  },
  start(p, container) {
    if (!isMarker(p)) return 0
    // Lines that become terms: the paragraph above, one closed by a single
    // blank line, or a candidate in a list. Always its parent's last child.
    let para: Block | undefined
    let dl: Block | undefined = container.type === DL ? container : undefined
    if (container.type === 'paragraph') para = container
    else {
      const last = container.lastChild
      if (last?.type === 'paragraph' && !last.open && (dl || last.endLine === p.lineNumber - 2)) para = last
      else if (!dl) return 0
    }
    if (para) {
      if (para.parent!.type === DL) dl = para.parent!
      else if (para.depth >= MAX_NESTING) return 0
      let n: number
      while (para.open && para.content.charCodeAt(0) === C_OPEN_BRACKET && (n = p.parseReference(para.content))) para.content = para.content.slice(n)
      if (!para.content || reMarkerLike.test(para.content)) return 0
    }
    p.closeUnmatchedBlocks()
    if (para) {
      const parent = para.parent!
      parent.children.pop()
      if (!dl) {
        dl = new Block(DL, para.startLine)
        dl.parent = parent
        dl.depth = para.depth
        parent.children.push(dl)
      }
      const lines = para.content.split('\n')
      lines.pop() // content ends with a newline
      const first = (para.open ? p.lineNumber - 1 : para.endLine) - lines.length + 1
      for (let i = 0; i < lines.length; i++) {
        const t = new Block(DT, first + i)
        t.parent = dl
        t.depth = dl.depth + 1
        t.open = false
        t.content = lines[i]
        dl.children.push(t)
      }
    }
    p.tip = dl!
    const dd = p.addChild(DD, p.nextNonspace)
    // Content column, as for list items: 1-4 spaces after `:`, else 1.
    const base = p.column
    p.advanceNextNonspace()
    p.advanceOffset(1)
    const col = p.column
    const off = p.offset
    do {
      p.advanceOffset(1, true)
    } while (p.column - col < 5 && isSpaceOrTab(p.peek(p.offset)))
    if (p.column - col >= 5) {
      p.column = col
      p.offset = off
      p.advanceOffset(1, true)
    }
    dd.data.indent = p.column - base
    return 1
  },
}

const termRule: BlockRule = { name: DT, content: 'inline', continue: () => 1 }

export const deflist = (): Plugin => ({
  name: 'deflist',
  block: [listRule, termRule, descriptionRule],
  render: {
    definitionList: (n, r) => r.h('dl', null, r.children(n)),
    definitionTerm: (n, r) => r.h('dt', null, r.children(n)),
    definitionDescription: (n, r) => r.h('dd', null, r.children(n)),
  },
})
