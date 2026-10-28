// Adversarial inputs (adapted from cmark's pathological tests): each must
// render in roughly linear time. Budgets are generous to avoid CI flakiness;
// a quadratic regression blows through them by orders of magnitude.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown } from '../src/index.ts'
import { budget } from './helpers.ts'

const md = createMarkdown({ html: true, plugins: gfm() })
const N = 30_000

const cases: Array<[string, string]> = [
  ['nested strong emphasis', '*a **a '.repeat(N) + 'b' + ' a** a*'.repeat(N)],
  ['many emphasis closers with no openers', 'a_ '.repeat(N)],
  ['many emphasis openers with no closers', '_a '.repeat(N)],
  ['many link closers with no openers', 'a]'.repeat(N)],
  ['many link openers with no closers', '[a'.repeat(N)],
  ['mismatched openers and closers', '*a_ '.repeat(N)],
  ['openers and closers multiple of 3', 'a**b' + 'c* '.repeat(N)],
  ['link openers and emph closers', '[ a_'.repeat(N)],
  ['nested brackets', '['.repeat(N) + 'a' + ']'.repeat(N)],
  ['nested block quotes', '> '.repeat(1000) + 'a'],
  ['deeply nested lists', Array.from({ length: 1000 }, (_, i) => ' '.repeat(i * 2) + '* a').join('\n')],
  ['backticks', Array.from({ length: 2000 }, (_, i) => 'e' + '`'.repeat(i + 1)).join('')],
  ['unclosed links A', '[a](<b'.repeat(N)],
  ['unclosed links B', '[a](b'.repeat(N)],
  ['unclosed <!--', '</' + '<!--'.repeat(N)],
  ['many references', Array.from({ length: N }, (_, i) => `[${i}]: u`).join('\n') + '\n' + '[0] '.repeat(N)],
  ['long paragraph with breaks', 'word  \n'.repeat(N)],
  // Regexes with overlapping alternatives or unanchored `x+$` (found in review).
  ['link title with many escapes', '[a](/u "' + '\\!'.repeat(N)],
  ['long space run before a soft break', 'a' + ' '.repeat(N * 3) + 'b \nc'],
  ['long inner space run in a paragraph', 'a' + ' '.repeat(N * 3) + 'b'],
  ['long space run in an ATX heading', '# a' + ' '.repeat(N * 3) + 'b'],
  ['HTML block with many trailing blank lines', '<!--\n' + '\n '.repeat(N) + 'x'],
  // GFM
  ['table: wide header, many short rows', '|' + 'a|'.repeat(5000) + '\n|' + '-|'.repeat(5000) + '\n' + 'x\n'.repeat(5000)],
  ['table: rows with many pipes', '|a|\n|-|\n' + ('|'.repeat(N) + '\n').repeat(10)],
  ['autolink: many @', 'a@'.repeat(N)],
  ['autolink: many www.', 'www. '.repeat(N)],
  ['autolink: many schemes', 'http://'.repeat(N)],
  ['autolink: long email-like run', 'a.'.repeat(N) + '@' + 'b.'.repeat(N)],
  ['strikethrough: many tildes', '~a '.repeat(N) + '~~b '.repeat(N)],
  ['footnotes: many references', '[^1] '.repeat(N) + '\n\n[^1]: note'],
  ['footnotes: many [^ without ]', '[^'.repeat(N)],
  ['footnotes: many ![^ without ]', '![^'.repeat(N)],
  ['table: alternating mismatched delimiter rows', 'a|b\n' + ':-\n-|-\n'.repeat(N / 2)],
  // Interleaved delimiters nested past MAX_NESTING (found by an agent review).
  ['interleaved *_ nested past the nesting cap', '*_a '.repeat(2 * N) + '_*'.repeat(2 * N)],
  ['interleaved ** __ nested past the nesting cap', '**__a '.repeat(N) + '__**'.repeat(N)],
  ['interleaved ~~ ** nested past the nesting cap', '~~**a '.repeat(N) + '**~~'.repeat(N)],
  ['many setext headings (sibling replacement)', 'a\n=\n'.repeat(4 * N)],
  ['many single-row GFM tables', '|a|\n|-|\n\n'.repeat(2 * N)],
  ['tilde runs of many lengths', Array.from({ length: 800 }, (_, k) => '~'.repeat(k + 1) + 'a' + '~'.repeat(k + 2) + ' ').join('')],
]

describe('pathological inputs', () => {
  for (const [name, input] of cases) {
    test(name, () => {
      const t0 = performance.now()
      md.render(input)
      const ms = performance.now() - t0
      assert.ok(ms < budget(2000), `${name}: ${ms.toFixed(0)} ms`)
    })
  }
})
