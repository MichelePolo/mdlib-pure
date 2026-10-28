// Highlighted text: `==text==` → <mark>.
//
//   This is ==very== important.
//
//   createMarkdown({ plugins: [mark()] })
//
// Syntax. A delimiter run of exactly two `=` on each side, with the same
// flanking rules as `*` (so `a==b==c` works inside a word, `== a ==` does
// not). Runs of other lengths stay text: `=a=`, `===a===`. Content is inline
// Markdown and nests with emphasis, strikethrough and links in both
// directions; code spans, autolinks and raw HTML take their `=` first.
//
// Block syntax is untouched: inlines are parsed after blocks, so `Title\n==`
// is still a setext heading and `a ==\n==` a heading with the text `a ==`.
//
// AST: `mark { children }` (see `Mark`).
// HTML: <mark>…</mark>.

import type { Parent, Plugin } from '../types.ts'

export interface Mark extends Parent {
  type: 'mark'
}

export const mark = (): Plugin => ({
  name: 'mark',
  delimiters: [{ char: '=', type: 'mark', sizes: [2] }],
  render: { mark: (n, r) => r.h('mark', null, r.children(n)) },
})
