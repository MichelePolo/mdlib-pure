// Front matter: YAML or TOML metadata at the very start of a document.
//
//   ---
//   title: Hello
//   ---
//   # Body
//
//   import { frontmatter, getFrontmatter } from 'mdlib-pure/frontmatter'
//   const md = createMarkdown({ plugins: [frontmatter()] })
//   const root = md.parse(src)
//   getFrontmatter(root)   // { type: 'yaml', value: 'title: Hello' } or null
//   md.render(root)     // the front matter is not rendered
//
// Syntax. Line 1 is exactly `---` (YAML) or `+++` (TOML) at column 1;
// trailing spaces and tabs are allowed. The block ends at the next line that
// is `---` or `...` (YAML) or `+++` (TOML), also at column 1 with only
// trailing spaces and tabs. Lines in between are kept raw: they are not
// Markdown, so `[x]: /url` there defines nothing. Nothing else opens front
// matter: not a later line, not after a blank first line, not indented, not
// inside a blockquote or list item. The value is not parsed (no YAML/TOML
// parser: zero dependencies); `getFrontmatter(root)` returns the raw string.
//
// Unclosed: not front matter, and the document parses as if the plugin were
// absent (`---` is a thematic break). Block rules see one line at a time, so
// the opener cannot look ahead for its closer. Instead the block takes every
// line raw, like a fenced code block, so it can only be closed by its closer
// or by the end of the document. In the latter case its content is the whole
// document; `finalize` parses it again with the rule switched off (`env`) and
// moves the result into the root. At most two passes over the input: linear.
//
// AST (mdast-util-frontmatter): `yaml { value }` or `toml { value }`, the
// first child of `root` (see `Frontmatter`). `value` is the lines between
// the fences, joined with `\n`, without the fences.
// HTML: nothing.

import type { Block, BlockParser } from '../block/parser.ts'
import type { BlockRule, Node, Plugin, Root } from '../types.ts'
import { isSpaceOrTab } from '../util/common.ts'

export interface Frontmatter extends Node {
  type: 'yaml' | 'toml'
  /** Raw text between the fences. */
  value: string
}

const OFF = 'frontmatter:off'

/** `line` is `fence` followed only by spaces and tabs. */
function isFence(line: string, fence: string): boolean {
  if (!line.startsWith(fence)) return false
  for (let i = 3; i < line.length; i++) if (!isSpaceOrTab(line.charCodeAt(i))) return false
  return true
}

const rule: BlockRule = {
  name: 'frontmatter',
  triggers: '-+',
  // First start rule: ahead of the thematic break (`---`) and of rules
  // appended without an anchor, e.g. GFM table rows, which have no triggers.
  before: 'blockquote',
  acceptsLines: true, // raw lines, from column 1: the opener is line 1 of `content`
  start(p, container) {
    if (p.lineNumber > 1 || p.nextNonspace > 0 || container !== p.doc || p.env[OFF]) return 0
    const type = isFence(p.line, '---') ? 'yaml' : isFence(p.line, '+++') ? 'toml' : ''
    if (!type) return 0
    p.addChild('frontmatter', 0).node.type = type
    return 2
  },
  continue(p, b) {
    const yaml = b.node.type === 'yaml'
    if (!isFence(p.line, yaml ? '---' : '+++') && !(yaml && isFence(p.line, '...'))) return 0
    b.data.closed = true
    p.finalize(b, p.lineNumber)
    return 2
  },
  finalize(p, b) {
    const s = b.content
    b.content = ''
    if (b.data.closed) b.node.value = s.slice(s.indexOf('\n') + 1, -1)
    else reparse(p, b, s)
  },
}

/**
 * The document ended inside the front matter, so `src` is the whole document
 * (line endings normalized). Only the end of the document can close an
 * unclosed block: `continue` always matches, and while a leaf that takes raw
 * lines is open no block start is tried. The root holds nothing else yet.
 */
function reparse(p: BlockParser, b: Block, src: string): void {
  const root = b.parent!
  p.env[OFF] = true
  const doc = p.parse(src)
  root.children = doc.children
  for (const c of doc.children) c.parent = root
}

export const frontmatter = (): Plugin => ({
  name: 'frontmatter',
  block: [rule],
  render: { yaml: () => null, toml: () => null },
})

/** The front matter of a parsed document, or `null`. A copy: changing it does not change the AST. */
export function getFrontmatter(root: Root): { type: 'yaml' | 'toml'; value: string } | null {
  const n = root.children[0]
  return n?.type === 'yaml' || n?.type === 'toml' ? { type: n.type, value: n.value as string } : null
}
