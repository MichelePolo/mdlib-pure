// Math: TeX between dollars, kept raw for KaTeX, MathJax, Temml…
//
//   Inline $e^{i\pi} + 1 = 0$, or display $$\sum_k a_k$$ inside a paragraph.
//
//   $$
//   \int_0^1 x^2 \, dx
//   $$
//
//   createMarkdown({ plugins: [math()] })
//   createMarkdown({ plugins: [math({ render: (tex, display) => katex.renderToString(tex, { displayMode: display }) })] })
//
// Inline (pandoc's rules). An opening `$` must not be followed by whitespace.
// The math ends at the next unescaped `$`: if that one is preceded by
// whitespace or followed by an ASCII digit, the opening `$` is plain text, so
// "$5 and $6" stays text. The content is raw TeX, like a code span: no
// Markdown, entities or escapes inside, and a backslash keeps the next char
// with it (`$\$5$` is the TeX `\$5`). Outside math, `\$` is a literal dollar.
// `$$…$$` inside a paragraph is display math: spaces inside are allowed (and
// trimmed), a single `$` inside does not close it, blank content is text.
// Runs of three or more dollars are text. Both may span soft line breaks.
//
// Block (like a fenced code block). A line starting with 2+ dollars, indented
// up to 3 spaces, opens; a line with at least as many dollars and nothing but
// spaces after them closes. Content lines are raw (the opener's indentation is
// removed from them). The rest of the opening line is `meta`, like a code info
// string (trimmed, escapes resolved); it may not contain `$`, so a one-line
// `$$x$$` is a paragraph with display math. The opener interrupts a paragraph:
// inline `$$…$$` that spans lines must not put `$$` at the start of a line.
// Unclosed, the block runs to the end of its container.
//
// AST (mdast-util-math names): `inlineMath { value }`, plus `display: true`
// for `$$…$$` in a paragraph (see `InlineMath`); `math { value, meta }`, value
// without the final line ending (see `Math`).
// HTML, TEX escaped, pandoc style so that KaTeX auto-render and MathJax find
// it with their default delimiters: <span class="math math-inline">\(TEX\)</span>,
// `math-display` with \[TEX\] for inline `$$`; blocks:
// <div class="math math-display">\[TEX\]</div> (the HTML string puts it on
// its own line, as for every <div>). With `render`, its output goes inside
// these elements, without delimiters.

import type { InlineParser } from '../inline/parser.ts'
import type { RenderContext, VChild } from '../render/vnode.ts'
import type { BlockRule, InlineRule, Node, Plugin } from '../types.ts'
import { C_BACKSLASH, isSpaceOrTab, isUnicodeWhitespace, trimMd } from '../util/common.ts'

export interface InlineMath extends Node {
  type: 'inlineMath'
  /** Raw TeX. */
  value: string
  /** Present for `$$…$$` inside a paragraph. */
  display?: true
}

export interface Math extends Node {
  type: 'math'
  /** Raw TeX, without the final line ending. */
  value: string
  /** Rest of the opening line, trimmed, escapes resolved; `null` if empty. */
  meta: string | null
}

export interface MathOptions {
  /**
   * Render TeX yourself. `display` is true for blocks and `$$…$$`. Return:
   * - a string: **trusted** HTML (e.g. `katex.renderToString`);
   * - VNodes (`h(...)`): rendered safely, keeping `renderTo` on the DOM path;
   * - `null`/`undefined`: default (escaped TeX).
   * The result goes inside the default `span`/`div`, which keeps its classes.
   */
  render?: (tex: string, display: boolean) => string | VChild | VChild[] | null
}

const C_DOLLAR = 36

/** Length of the run of `$` at `i`. */
function dollars(s: string, i: number): number {
  const start = i
  while (s.charCodeAt(i) === C_DOLLAR) i++
  return i - start
}

/**
 * `$…$` or `$$…$$` at `p.pos`. An attempt stops at the next unescaped `$`
 * (`$$` for display math) and parsing resumes right after the opener when it
 * fails, so failed attempts of one kind never rescan the same text: linear.
 */
function parseMath(p: InlineParser): boolean {
  const s = p.src
  const start = p.pos
  const run = dollars(s, start)
  let i = start + run
  if (run === 1) {
    if (i >= s.length || isUnicodeWhitespace(s[i])) return false
    let escaped = -1 // last char taken by a backslash
    for (; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c === C_BACKSLASH) escaped = ++i
      else if (c === C_DOLLAR) break
    }
    if (i >= s.length || (escaped !== i - 1 && isUnicodeWhitespace(s[i - 1]))) return false
    const next = s.charCodeAt(i + 1)
    if (next >= 48 && next <= 57) return false
    p.push({ type: 'inlineMath', value: s.slice(start + 1, i) })
    p.pos = i + 1
    return true
  }
  if (run === 2) {
    for (; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c === C_BACKSLASH) i++
      else if (c === C_DOLLAR && s.charCodeAt(i + 1) === C_DOLLAR) break
    }
    const value = i < s.length ? trimMd(s.slice(start + 2, i)) : ''
    if (value) {
      p.push({ type: 'inlineMath', value, display: true })
      p.pos = i + 2
      return true
    }
  }
  // Not math: the whole run is text (retrying each `$` of it would be O(n²)).
  p.pos = start + run
  p.text(s.slice(start, p.pos))
  return true
}

const inlineRule: InlineRule = { name: 'inlineMath', triggers: '$', parse: parseMath }

const blockRule: BlockRule = {
  name: 'math',
  triggers: '$',
  // Ahead of rules appended without an anchor, e.g. GFM table rows, which
  // have no triggers and would take the opening line as a row.
  before: 'fencedCode',
  acceptsLines: true,
  start(p) {
    const run = p.indented ? 0 : dollars(p.line, p.nextNonspace)
    if (run < 2 || p.line.includes('$', p.nextNonspace + run)) return 0
    p.closeUnmatchedBlocks()
    const b = p.addChild('math', p.nextNonspace)
    b.data.fence = run
    b.data.indent = p.indent
    p.advanceNextNonspace()
    p.advanceOffset(run) // the rest of the line (meta) becomes the first content line
    return 2
  },
  continue(p, b) {
    const run = p.indented ? 0 : dollars(p.line, p.nextNonspace)
    if (run >= b.data.fence) {
      let i = p.nextNonspace + run
      while (isSpaceOrTab(p.line.charCodeAt(i))) i++
      if (i >= p.line.length) {
        p.finalize(b, p.lineNumber)
        return 2
      }
    }
    for (let i = b.data.indent; i > 0 && isSpaceOrTab(p.peek(p.offset)); i--) p.advanceOffset(1, true)
    return 0
  },
  finalize(p, b) {
    const nl = b.content.indexOf('\n')
    b.node.meta = p.unescape(trimMd(b.content.slice(0, nl))) || null
    b.node.value = b.content.slice(nl + 1, -1)
    b.content = ''
  },
}

export function math(options: MathOptions = {}): Plugin {
  const { render } = options
  const element = (r: RenderContext, tag: string, display: boolean, tex: string): VChild => {
    const out = render?.(tex, display)
    // Default: TeX in \(…\) / \[…\] (pandoc style), the delimiters KaTeX
    // auto-render and MathJax look for out of the box.
    const fallback = tex === '' ? '' : display ? `\\[${tex}\\]` : `\\(${tex}\\)`
    return r.h(tag, { class: display ? 'math math-display' : 'math math-inline' }, typeof out === 'string' ? r.raw(out) : out || fallback)
  }
  return {
    name: 'math',
    block: [blockRule],
    inline: [inlineRule],
    render: {
      inlineMath: (n, r) => element(r, 'span', n.display === true, n.value as string),
      math: (n, r) => element(r, 'div', true, n.value as string),
    },
  }
}
