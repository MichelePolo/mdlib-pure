// The website's own code (site/), where it runs on input typed by visitors:
// the playground highlights code blocks with site/lib/highlight.js.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { budget } from './helpers.ts'

// A computed specifier: site/ is plain JavaScript, outside the typecheck.
const { highlight } = await import(new URL('../site/lib/highlight.js', import.meta.url).href)

type Piece = string | { children: string[] }
const text = (pieces: Piece[]) => pieces.map((p) => (typeof p === 'string' ? p : p.children.join(''))).join('')

test('site highlighter: names before a lookahead stay linear', () => {
  // On failure the tokenizer consumes one word, so an unbounded name run
  // before `(?==)` or `(?=\()` was rescanned from every word inside it.
  for (const [lang, unit] of [['html', 'a.'], ['razor', 'a:'], ['css', 'a-'], ['css', '-a'], ['js', 'a.'], ['csharp', 'a.']]) {
    const t = performance.now()
    highlight(unit.repeat(200_000), lang)
    const ms = performance.now() - t
    assert.ok(ms < budget(2000), `${lang} ${JSON.stringify(unit)}: ${ms.toFixed(0)} ms`)
  }
})

test('site highlighter: tokens cover the input exactly', () => {
  const code = '<a href="x" data-a.b=1>@if (ok) { Run("s"); }</a> /* c */ --x: 1;'
  for (const lang of ['html', 'razor', 'css', 'js', 'csharp']) assert.equal(text(highlight(code, lang)), code, lang)
  // A name longer than the bound is still covered, just not marked as a prop.
  const long = `<a ${'x'.repeat(100)}="1">`
  assert.equal(text(highlight(long, 'html')), long)
  assert.equal(highlight('x', 'no-such-lang'), null)
})
