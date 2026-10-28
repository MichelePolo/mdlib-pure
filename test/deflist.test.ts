import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toElements } from '../src/adapter.ts'
import { decodeEntity } from '../src/entities/index.ts'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown, MAX_NESTING, type Node, type Plugin } from '../src/index.ts'
import { container } from '../src/plugins/container.ts'
import { deflist } from '../src/plugins/deflist.ts'
import { normalize } from './helpers.ts'

const md = createMarkdown({ plugins: [deflist()] })
const dl = (...parts: string[]) => `<dl>\n${parts.join('')}</dl>\n`
const dt = (s: string) => `<dt>${s}</dt>\n`
const dd = (s: string) => `<dd>${s}</dd>\n`
const ddLoose = (...paras: string[]) => `<dd>\n${paras.map((p) => `<p>${p}</p>\n`).join('')}</dd>\n`

describe('deflist: syntax', () => {
  test('term and definition', () => {
    assert.equal(md.render('Term\n: Definition'), '<dl>\n<dt>Term</dt>\n<dd>Definition</dd>\n</dl>\n')
  })

  test('several definitions; lazy continuation lines', () => {
    assert.equal(
      md.render('Term\n: Definition, may continue\non following lines (lazy)\n: Second definition'),
      dl(dt('Term'), dd('Definition, may continue\non following lines (lazy)'), dd('Second definition')),
    )
  })

  test('each line of the paragraph is a term', () => {
    assert.equal(md.render('Term A\nTerm B\n: Shared definition'), dl(dt('Term A'), dt('Term B'), dd('Shared definition')))
  })

  test('block content indented to the content column', () => {
    assert.equal(
      md.render('Term\n:   Definition with block content\n\n    Second paragraph, indented to the content column.'),
      dl(dt('Term'), ddLoose('Definition with block content', 'Second paragraph, indented to the content column.')),
    )
    // The content column follows the marker: `: ` → 2, `:\t` → 4, indented marker → more.
    assert.equal(md.render('T\n: a\n\n  b'), dl(dt('T'), ddLoose('a', 'b')))
    assert.equal(md.render('T\n:\ta\n\n\tb'), dl(dt('T'), ddLoose('a', 'b')))
    assert.equal(md.render('T\n   : a\n\n     b'), dl(dt('T'), ddLoose('a', 'b')))
    // Short of the column: after the list, where 4 spaces are indented code (like `   - a`).
    assert.equal(md.render('T\n   : a\n\n    b'), dl(dt('T'), dd('a')) + '<pre><code>b\n</code></pre>\n')
  })

  test('5+ spaces after the colon: indented code, content column is colon + 1', () => {
    assert.equal(md.render('T\n:     code\n\n      more'), dl(dt('T'), '<dd>\n<pre><code>code\n\nmore\n</code></pre>\n</dd>\n'))
  })

  test('nested blocks in a definition', () => {
    assert.equal(md.render('T\n: - a\n  - b'), dl(dt('T'), '<dd>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n</dd>\n'))
    assert.equal(md.render('T\n: > q\n  > r'), dl(dt('T'), '<dd>\n<blockquote>\n<p>q\nr</p>\n</blockquote>\n</dd>\n'))
    assert.equal(md.render('T\n: ```js\n  x\n  ```'), dl(dt('T'), '<dd>\n<pre><code class="language-js">x\n</code></pre>\n</dd>\n'))
    assert.equal(md.render('T\n: # H\n  text'), dl(dt('T'), '<dd>\n<h1>H</h1>\ntext</dd>\n'))
  })

  test('inline content; terms are trimmed', () => {
    assert.equal(md.render('*Term* `x`  \n: **def** [l](/u)'), dl(dt('<em>Term</em> <code>x</code>'), dd('<strong>def</strong> <a href="/u">l</a>')))
    // One term per line: inlines do not span term lines.
    assert.equal(md.render('*a\nb*\n: d'), dl(dt('*a'), dt('b*'), dd('d')))
  })

  test('link reference definitions above the terms are not terms', () => {
    assert.equal(md.render('[a]: /u\nTerm [a]\n: see [a]'), dl(dt('Term <a href="/u">a</a>'), dd('see <a href="/u">a</a>')))
  })

  test('AST shape', () => {
    assert.deepEqual(md.parse('T *x*\n: a\n: b').children, [
      {
        type: 'definitionList',
        spread: false,
        children: [
          { type: 'definitionTerm', children: [{ type: 'text', value: 'T ' }, { type: 'emphasis', children: [{ type: 'text', value: 'x' }] }] },
          { type: 'definitionDescription', spread: false, children: [{ type: 'paragraph', children: [{ type: 'text', value: 'a' }] }] },
          { type: 'definitionDescription', spread: false, children: [{ type: 'paragraph', children: [{ type: 'text', value: 'b' }] }] },
        ],
      },
    ])
    assert.deepEqual(md.parse('T\n\n: a').children, [
      {
        type: 'definitionList',
        spread: true,
        children: [
          { type: 'definitionTerm', children: [{ type: 'text', value: 'T' }] },
          { type: 'definitionDescription', spread: true, children: [{ type: 'paragraph', children: [{ type: 'text', value: 'a' }] }] },
        ],
      },
    ])
  })

  test('classes map; tight paragraphs have no element to style', () => {
    const styled = createMarkdown({ plugins: [deflist()], classes: { definitionList: 'l', definitionTerm: 't', definitionDescription: 'd', paragraph: 'p' } })
    assert.equal(styled.render('T\n: a'), '<dl class="l">\n<dt class="t">T</dt>\n<dd class="d">a</dd>\n</dl>\n')
    assert.equal(styled.render('T\n\n: a'), '<dl class="l">\n<dt class="t">T</dt>\n<dd class="d">\n<p class="p">a</p>\n</dd>\n</dl>\n')
  })

  test('in a tight definition, children still see it as r.parent', () => {
    const seen: Array<string | undefined> = []
    const spy: Plugin = { name: 'spy', render: { list: (n, r) => (seen.push(r.parent?.type), r.h('ul', null, r.children(n))) } }
    createMarkdown({ plugins: [deflist(), spy] }).render('T\n: a\n  - b')
    assert.deepEqual(seen, ['definitionDescription'])
  })
})

describe('deflist: groups and looseness', () => {
  test('groups separated by blank lines form one tight list', () => {
    const out = dl(dt('T1'), dd('d1'), dd('d2'), dt('T2'), dd('d3'))
    assert.equal(md.render('T1\n: d1\n: d2\n\nT2\n: d3'), out)
    assert.equal(md.render('T1\n: d1\n: d2\n\n\n\nT2\n: d3'), out)
  })

  test('without a blank line the next term is a lazy line of the definition', () => {
    assert.equal(md.render('T1\n: d1\nT2\n: d2'), dl(dt('T1'), dd('d1\nT2'), dd('d2')))
  })

  test('a definition that takes no lazy lines can be followed directly by terms', () => {
    assert.equal(md.render('T1\n: # d1\nT2\n: d2'), dl(dt('T1'), '<dd>\n<h1>d1</h1>\n</dd>\n', dt('T2'), dd('d2')))
  })

  test('one blank line between terms and marker (Pandoc) makes the list loose', () => {
    assert.equal(md.render('Term\n\n: Definition'), dl(dt('Term'), ddLoose('Definition')))
    assert.equal(md.render('T1\n: d1\n\nT2\n\n: d2'), dl(dt('T1'), ddLoose('d1'), dt('T2'), ddLoose('d2')))
    assert.equal(md.render('T1\n: d1\n\nT2\n\n: d2\n: d3'), dl(dt('T1'), ddLoose('d1'), dt('T2'), ddLoose('d2'), ddLoose('d3')))
  })

  test('a blank line between definitions, or inside one, makes the list loose', () => {
    assert.equal(md.render('T\n: a\n\n: b'), dl(dt('T'), ddLoose('a'), ddLoose('b')))
    assert.equal(md.render('T\n: a\n\n  b\n\nU\n: c'), dl(dt('T'), ddLoose('a', 'b'), dt('U'), ddLoose('c')))
  })

  test('a blank line inside a nested block does not loosen the list', () => {
    assert.equal(md.render('T\n: - a\n\n  - b'), dl(dt('T'), '<dd>\n<ul>\n<li>\n<p>a</p>\n</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n</dd>\n'))
  })

  test('a paragraph after the list that no marker follows stays a paragraph', () => {
    const list = dl(dt('T'), dd('d'))
    assert.equal(md.render('T\n: d\n\nP'), list + '<p>P</p>\n')
    assert.equal(md.render('T\n: d\n\nP\n\nQ'), list + '<p>P</p>\n<p>Q</p>\n')
    assert.equal(md.render('T\n: d\n\nP\n\n\n: x'), list + '<p>P</p>\n<p>: x</p>\n')
    assert.equal(md.render('T\n: d\n\nP\n# H'), list + '<p>P</p>\n<h1>H</h1>\n')
    assert.equal(md.render('T\n: d\n\nP\n- i'), list + '<p>P</p>\n<ul>\n<li>i</li>\n</ul>\n')
    assert.equal(md.render('T\n: d\n\nP\n---\n: x'), list + '<h2>P</h2>\n<p>: x</p>\n')
  })

  test('a marker at a definition content column nests', () => {
    const inner = dl(dt('a'), dd('b'))
    assert.equal(md.render('T\n: a\n  : b'), dl(dt('T'), `<dd>\n${inner}</dd>\n`))
    assert.equal(md.render('T\n:   a\n  : b'), dl(dt('T'), dd('a'), dd('b'))) // column 4: a sibling
  })

  test('trailing blank lines do not belong to the list (outer list looseness)', () => {
    const loose = (inner: string) => '<ul>\n<li>\n' + inner + '</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n'
    assert.equal(md.render('- > x\n\n- b'), loose('<blockquote>\n<p>x</p>\n</blockquote>\n'))
    assert.equal(md.render('- T\n  : x\n\n- b'), loose(dl(dt('T'), dd('x'))))
    assert.equal(md.render('- T\n  : x\n- b'), '<ul>\n<li>\n' + dl(dt('T'), dd('x')) + '</li>\n<li>b</li>\n</ul>\n')
  })
})

describe('deflist: not definition lists', () => {
  test('without the plugin it is a paragraph', () => {
    assert.equal(createMarkdown().render('Term\n: Definition'), '<p>Term\n: Definition</p>\n')
  })

  test('the marker needs a space or tab and content', () => {
    assert.equal(md.render('T\n:d'), '<p>T\n:d</p>\n')
    assert.equal(md.render('T\n:'), '<p>T\n:</p>\n')
    assert.equal(md.render('T\n:   '), '<p>T\n:</p>\n')
    assert.equal(md.render('T\n::: x'), '<p>T\n::: x</p>\n')
  })

  test('4 spaces of indentation is paragraph text or code, not a marker', () => {
    assert.equal(md.render('T\n    : d'), '<p>T\n: d</p>\n')
    assert.equal(md.render('T\n\n    : d'), '<p>T</p>\n<pre><code>: d\n</code></pre>\n')
  })

  test('no paragraph right above', () => {
    assert.equal(md.render(': d'), '<p>: d</p>\n')
    assert.equal(md.render('# H\n: d'), '<h1>H</h1>\n<p>: d</p>\n')
    assert.equal(md.render('***\n: d'), '<hr />\n<p>: d</p>\n')
    assert.equal(md.render('```\nx\n```\n: d'), '<pre><code>x\n</code></pre>\n<p>: d</p>\n')
    assert.equal(md.render('T\n\n\n: d'), '<p>T</p>\n<p>: d</p>\n')
  })

  test('a paragraph that starts like a marker is never terms', () => {
    assert.equal(md.render(': a\n: b'), '<p>: a\n: b</p>\n')
    assert.equal(md.render(': a\nT\n: b'), '<p>: a\nT\n: b</p>\n')
    assert.equal(md.render(':\n\n: b'), '<p>:</p>\n<p>: b</p>\n')
    assert.equal(md.render('[a]: /u\n: b\n: c'), '<p>: b\n: c</p>\n')
  })

  test('a lazy line is not in the paragraph container (as in CommonMark)', () => {
    assert.equal(md.render('> T\n: d'), '<blockquote>\n<p>T\n: d</p>\n</blockquote>\n')
    assert.equal(md.render('- T\n: d'), '<ul>\n<li>T\n: d</li>\n</ul>\n')
    assert.equal(md.render('> T\n>\n: d'), '<blockquote>\n<p>T</p>\n</blockquote>\n<p>: d</p>\n')
  })

  test('code and HTML blocks keep their lines', () => {
    assert.equal(md.render('```\nT\n: d\n```'), '<pre><code>T\n: d\n</code></pre>\n')
    assert.equal(createMarkdown({ html: true, plugins: [deflist()] }).render('<div>\nT\n: d\n</div>'), '<div>\nT\n: d\n</div>\n')
  })

  test('every CommonMark example renders the same with the plugin (no example has a marker line)', () => {
    const examples: Array<{ markdown: string; html: string }> = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2.json', import.meta.url), 'utf8'))
    for (const plugins of [[deflist()], [deflist(), container()], [container(), deflist()]]) {
      const spec = createMarkdown({ html: true, decodeEntity, allowUrl: () => true, plugins })
      assert.deepEqual(examples.filter((ex) => spec.render(ex.markdown) !== ex.html).map((ex) => ex.markdown), [])
    }
  })

  test('every GFM example renders the same with the plugin, in both orders', () => {
    const examples: Array<{ markdown: string; html: string }> = JSON.parse(readFileSync(new URL('./fixtures/gfm.json', import.meta.url), 'utf8'))
    for (const plugins of [[...gfm({ alerts: false }), deflist()], [deflist(), ...gfm({ alerts: false })]]) {
      const spec = createMarkdown({ html: true, decodeEntity, allowUrl: () => true, plugins })
      const failing = examples.filter((ex) => ex.html.trim() !== '<IGNORE>' && normalize(spec.render(ex.markdown)) !== normalize(ex.html))
      assert.deepEqual(failing.map((ex) => ex.markdown), [])
    }
  })
})

describe('deflist: in containers and with other plugins', () => {
  test('inside a blockquote, a list item and a footnote', () => {
    assert.equal(md.render('> T\n> : d\n>\n> U\n>\n> : e'), '<blockquote>\n' + dl(dt('T'), ddLoose('d'), dt('U'), ddLoose('e')) + '</blockquote>\n')
    assert.equal(md.render('> T\n> : d\n>\n> P\n\nx'), '<blockquote>\n' + dl(dt('T'), dd('d')) + '<p>P</p>\n</blockquote>\n<p>x</p>\n')
    assert.equal(md.render('- a\n\n  T\n\n  : d'), '<ul>\n<li>\n<p>a</p>\n' + dl(dt('T'), ddLoose('d')) + '</li>\n</ul>\n')
    const notes = createMarkdown({ plugins: [...gfm(), deflist()] })
    assert.match(notes.render('x[^1]\n\n[^1]: T\n    : d'), /<li id="fn-1">\n<dl>\n<dt>T<\/dt>\n<dd>d<\/dd>\n<\/dl>\n<a href="#fnref-1"/)
  })

  test('with GFM, in any plugin order', () => {
    const src = '~~T~~ www.x.y\n: | a |\n  |---|\n  | 1 |\n: - [x] done\n\nP\n| h |\n|---|'
    const out =
      dl(
        dt('<del>T</del> <a href="http://www.x.y">www.x.y</a>'),
        '<dd>\n<table>\n<thead>\n<tr>\n<th>a</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n</tr>\n</tbody>\n</table>\n</dd>\n',
        '<dd>\n<ul>\n<li><input type="checkbox" checked="" disabled="" /> done</li>\n</ul>\n</dd>\n',
      ) + '<p>P</p>\n<table>\n<thead>\n<tr>\n<th>h</th>\n</tr>\n</thead>\n</table>\n'
    assert.equal(createMarkdown({ plugins: [...gfm(), deflist()] }).render(src), out)
    assert.equal(createMarkdown({ plugins: [deflist(), ...gfm()] }).render(src), out)
    // A table header right after the list is not a term.
    assert.equal(createMarkdown({ plugins: [deflist(), ...gfm()] }).render('T\n: d\n\n| h |\n|---|').replace(/<table>[^]*/, ''), dl(dt('T'), dd('d')))
  })

  test('with containers, in any plugin order', () => {
    const open = (kind: string) => `<div class="md-container md-container-${kind}">\n`
    for (const plugins of [[container(), deflist()], [deflist(), container()]]) {
      const both = createMarkdown({ plugins })
      assert.equal(both.render('::: n\nT\n: d\n:::\nafter'), open('n') + dl(dt('T'), dd('d')) + '</div>\n<p>after</p>\n')
      assert.equal(both.render('::: n\nT\n: d\n\nP\n:::\nafter'), open('n') + dl(dt('T'), dd('d')) + '<p>P</p>\n</div>\n<p>after</p>\n')
      assert.equal(both.render('T\n: ::: n\n  x\n  :::\n: e'), dl(dt('T'), '<dd>\n' + open('n') + '<p>x</p>\n</div>\n</dd>\n', dd('e')))
    }
  })

  test('framework adapter: same markup through React', () => {
    const tree = md.toVNodes('T\n: a\n: b\n\nU\n\n: c')
    const html = renderToStaticMarkup(createElement('div', null, ...toElements(tree, createElement, 'react')))
    assert.equal(html, `<div>${md.render('T\n: a\n: b\n\nU\n\n: c').replace(/\n/g, '')}</div>`)
  })
})

describe('deflist: pathological inputs', () => {
  const N = 30_000
  const all = createMarkdown({ html: true, plugins: [...gfm(), container(), deflist()] })
  const nested = (levels: number) => 'T\n' + Array.from({ length: levels }, (_, i) => ' '.repeat(2 * i) + ': x').join('\n') + '\n'
  const cases: Array<[string, string]> = [
    ['many groups', 'T\n: d\n\n'.repeat(N)],
    ['many Pandoc groups', 'T\n\n: d\n\n'.repeat(N)],
    ['many definitions of one term', 'T\n' + ': d\n'.repeat(N)],
    ['many loose definitions', 'T\n' + '\n: d\n'.repeat(N)],
    ['many terms', 'T\n'.repeat(N) + ': d'],
    ['many markers without a term', ': d\n'.repeat(N)],
    ['many candidates that are not terms', 'T\n: d\n\n' + 'p\n\n'.repeat(N)],
    ['lists separated by paragraphs', 'T\n: d\n\np\n\n\n'.repeat(N)],
    ['lists separated by headings', 'T\n: d\n# h\n'.repeat(N)],
    ['many reference definitions above a marker', '[a]: /u\n'.repeat(N) + ': d\n: e'],
    ['reference definitions above terms', '[a]: /u\n'.repeat(N) + 'T\n: d'],
    ['empty markers with long space runs', ('T\n:' + ' '.repeat(1000) + '\n').repeat(1000)],
    ['long space run after the colon', 'T\n:' + ' '.repeat(N * 10) + 'x'],
    ['many colons on one line', 'T\n' + ': '.repeat(N * 5) + 'x'],
    ['deeply nested definitions', nested(1000)],
    ['deep nesting, then deeply indented lines', nested(60) + (' '.repeat(120) + 'x\n').repeat(N / 10)],
    ['deep nesting, then many top-level markers', nested(60) + ': d\n'.repeat(N)],
    ['definitions in nested blockquotes', Array.from({ length: 300 }, (_, i) => '> '.repeat(i) + 'T\n' + '> '.repeat(i) + ': d').join('\n')],
    ['definitions in nested lists', Array.from({ length: 1000 }, (_, i) => ' '.repeat(i * 2) + '- T\n' + ' '.repeat(i * 2 + 2) + ': d').join('\n')],
  ]
  for (const [name, input] of cases) {
    test(name, () => {
      const t0 = performance.now()
      all.render(input)
      const ms = performance.now() - t0
      assert.ok(ms < 2000, `${name}: ${ms.toFixed(0)} ms`)
    })
  }

  /** Deepest definitionDescription, counting block ancestors like the parser (root = 0). */
  const maxDepth = (node: Node, depth = 0): number =>
    Math.max(node.type === 'definitionDescription' ? depth : 0, ...(node.children ?? []).map((c) => maxDepth(c, depth + 1)))

  test('nesting is capped at MAX_NESTING', () => {
    const root = md.parse(nested(200))
    assert.equal(maxDepth(root), MAX_NESTING)
    assert.equal(md.render(nested(200)).split('<dl>').length - 1, MAX_NESTING / 2)
  })

  test('a paragraph at MAX_NESTING does not become terms', () => {
    const quoted = (depth: number) => '> '.repeat(depth) + 'T\n' + '> '.repeat(depth) + ': d'
    assert.equal(maxDepth(md.parse(quoted(MAX_NESTING - 2))), MAX_NESTING)
    assert.ok(!md.render(quoted(MAX_NESTING - 1)).includes('<dl>'))
  })
})
