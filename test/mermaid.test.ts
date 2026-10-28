import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown, h } from '../src/index.ts'
import { container } from '../src/plugins/container.ts'
import { mermaid } from '../src/plugins/mermaid.ts'
import { budget } from './helpers.ts'

const md = createMarkdown({ plugins: [mermaid()] })
const diagram = '```mermaid\ngraph TD\n  A-->B\n```'

describe('mermaid: markup', () => {
  test('a mermaid fence becomes <pre class="mermaid"> with the escaped source', () => {
    assert.equal(md.render(diagram), '<pre class="mermaid">graph TD\n  A--&gt;B\n</pre>\n')
    assert.equal(md.render('~~~mermaid\nA["<b>x</b>"]\n~~~'), '<pre class="mermaid">A[&quot;&lt;b&gt;x&lt;/b&gt;&quot;]\n</pre>\n')
  })

  test('AST: mermaid { value } replaces the code node', () => {
    assert.deepEqual(md.parse(diagram).children, [{ type: 'mermaid', value: 'graph TD\n  A-->B\n' }])
  })

  test('other code blocks are untouched, including mermaid-like info strings', () => {
    assert.equal(md.render('```js\nx\n```'), '<pre><code class="language-js">x\n</code></pre>\n')
    assert.equal(md.render('```mermaidx\nx\n```'), '<pre><code class="language-mermaidx">x\n</code></pre>\n')
    assert.equal(md.render('`mermaid`'), '<p><code>mermaid</code></p>\n')
  })

  test('found inside containers: blockquote, list item, ::: container, GFM alert', () => {
    const all = createMarkdown({ plugins: [...gfm(), container(), mermaid()] })
    for (const src of ['> ```mermaid\n> A\n> ```', '- ```mermaid\n  A\n  ```', '::: note\n```mermaid\nA\n```\n:::', '> [!TIP]\n> ```mermaid\n> A\n> ```']) {
      assert.match(all.render(src), /<pre class="mermaid">A\n<\/pre>/, src)
    }
  })

  test('the highlight option does not see mermaid blocks', () => {
    const seen: string[] = []
    const md2 = createMarkdown({ plugins: [mermaid()], highlight: (_c, lang) => (seen.push(String(lang)), null) })
    md2.render(diagram + '\n\n```js\nx\n```')
    assert.deepEqual(seen, ['js'])
  })
})

describe('mermaid: render option (pre-rendered output)', () => {
  test('string: trusted HTML (e.g. SVG made at build time)', () => {
    const md2 = createMarkdown({ plugins: [mermaid({ render: (src) => `<svg data-src="${src.length}"></svg>` })] })
    assert.equal(md2.render(diagram), '<div class="mermaid-diagram">\n<svg data-src="17"></svg>\n</div>\n')
  })

  test('VNodes: safe path; null keeps the default markup', () => {
    const md2 = createMarkdown({ plugins: [mermaid({ render: (src) => (src.includes('B') ? h('span', null, 'diagram') : null) })] })
    assert.equal(md2.render(diagram), '<div class="mermaid-diagram">\n<span>diagram</span>\n</div>\n')
    assert.equal(md2.render('```mermaid\nA\n```'), '<pre class="mermaid">A\n</pre>\n')
    assert.ok(!JSON.stringify(md2.toVNodes(diagram)).includes('"raw"'))
  })
})

describe('mermaid: adversarial input', () => {
  test('many diagrams and many non-mermaid fences stay fast', () => {
    for (const input of ['```mermaid\nA\n```\n'.repeat(20_000), '```js\nx\n```\n'.repeat(20_000), '```mermaid\n' + 'A-->B\n'.repeat(100_000)]) {
      const t0 = performance.now()
      md.render(input)
      assert.ok(performance.now() - t0 < budget(2000))
    }
  })
})
