import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown } from '../src/index.ts'
import { headings, slug, slugger, toc } from '../src/plugins/headings.ts'
import { budget } from './helpers.ts'

describe('headings: slugs (GitHub-compatible)', () => {
  test('basic rules', () => {
    assert.equal(slug('Hello World'), 'hello-world')
    assert.equal(slug('Foo & Bar!'), 'foo--bar')
    assert.equal(slug('Über Café'), 'über-café')
    assert.equal(slug('🚀 Launch'), '-launch')
    assert.equal(slug('snake_case and kebab-case'), 'snake_case-and-kebab-case')
    assert.equal(slug('v1.2.3'), 'v123')
  })

  test('duplicates get -1, -2 and never collide with literal ones', () => {
    const next = slugger()
    assert.deepEqual(['a', 'a', 'a-1', 'a'].map(next), ['a', 'a-1', 'a-1-1', 'a-2'])
    const other = slugger()
    assert.deepEqual(['a-1', 'a', 'a'].map(other), ['a-1', 'a', 'a-2'])
  })

  test('no slug characters → section; prototype names are fine', () => {
    const next = slugger()
    assert.deepEqual(['!!!', '', 'constructor', 'constructor'].map(next), ['section', 'section-1', 'constructor', 'constructor-1'])
  })
})

describe('headings: plugin', () => {
  const md = createMarkdown({ plugins: [headings()] })

  test('clean ids by default; prefix opt-in for untrusted input', () => {
    assert.equal(md.render('# config'), '<h1 id="config">config</h1>\n')
    assert.equal(createMarkdown({ plugins: [headings({ prefix: 'user-content-' })] }).render('# config'), '<h1 id="user-content-config">config</h1>\n')
  })

  test('ids from visible text (inline code yes, image alt no)', () => {
    assert.equal(md.render('# Install `npm` *now*\n\n## ![logo](/l.png) Docs'), '<h1 id="install-npm-now">Install <code>npm</code> <em>now</em></h1>\n<h2 id="-docs"><img src="/l.png" alt="logo" /> Docs</h2>\n')
  })

  test('prefix and permalink', () => {
    const md2 = createMarkdown({ plugins: [headings({ prefix: 'user-content-', permalink: true })] })
    assert.equal(
      md2.render('## A & B'),
      '<h2 id="user-content-a--b">A &amp; B <a class="md-anchor" href="#user-content-a--b" aria-label="Permalink: A &amp; B">#</a></h2>\n',
    )
  })

  test('headings in nested containers get ids too, in document order', () => {
    const root = md.parse('# A\n\n> ## A\n\n- ### B\n\nSetext\n---')
    assert.deepEqual(toc(root), [
      { depth: 1, id: 'a', text: 'A' },
      { depth: 2, id: 'a-1', text: 'A' },
      { depth: 3, id: 'b', text: 'B' },
      { depth: 2, id: 'setext', text: 'Setext' },
    ])
  })

  test('works with GFM and the classes map', () => {
    const md3 = createMarkdown({ plugins: [...gfm(), headings()], classes: { heading2: 'text-2xl' } })
    assert.equal(md3.render('## ~~Old~~ New'), '<h2 id="old-new" class="text-2xl"><del>Old</del> New</h2>\n')
  })

  test('without the plugin, no ids', () => {
    assert.equal(toc(createMarkdown().parse('# A')).length, 0)
  })

  test('adversarial: many duplicate headings stay fast', () => {
    const t0 = performance.now()
    md.render('# a\n'.repeat(20_000))
    assert.ok(performance.now() - t0 < budget(2000))
  })
})
