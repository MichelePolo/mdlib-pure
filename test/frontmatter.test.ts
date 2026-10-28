import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown } from '../src/index.ts'
import { container } from '../src/plugins/container.ts'
import { frontmatter, getFrontmatter } from '../src/plugins/frontmatter.ts'
import { headings } from '../src/plugins/headings.ts'
import { mark } from '../src/plugins/mark.ts'

const md = createMarkdown({ plugins: [frontmatter()] })
const core = createMarkdown()
const fm = (src: string) => getFrontmatter(md.parse(src))

describe('frontmatter: syntax', () => {
  test('YAML: parsed, not rendered', () => {
    const src = '---\ntitle: Hello\ntags: [a, b]\n---\n# Body'
    assert.equal(md.render(src), '<h1>Body</h1>\n')
    assert.deepEqual(fm(src), { type: 'yaml', value: 'title: Hello\ntags: [a, b]' })
  })

  test('YAML closed by ...', () => {
    assert.deepEqual(fm('---\na: 1\n...\nb'), { type: 'yaml', value: 'a: 1' })
    assert.equal(md.render('---\na: 1\n...\nb'), '<p>b</p>\n')
  })

  test('TOML: +++ … +++', () => {
    assert.deepEqual(fm('+++\ntitle = "x"\n+++\nb'), { type: 'toml', value: 'title = "x"' })
    assert.equal(md.render('+++\ntitle = "x"\n+++\nb'), '<p>b</p>\n')
  })

  test('empty front matter, and a document that is only front matter', () => {
    assert.deepEqual(fm('---\n---'), { type: 'yaml', value: '' })
    assert.deepEqual(fm('+++\n+++\n'), { type: 'toml', value: '' })
    assert.equal(md.render('---\na: 1\n---\n'), '')
  })

  test('trailing spaces and tabs on the fences', () => {
    assert.deepEqual(fm('---  \na\n--- \t'), { type: 'yaml', value: 'a' })
    assert.deepEqual(fm('+++\t\na\n+++  '), { type: 'toml', value: 'a' })
    assert.deepEqual(fm('---\na\n...  '), { type: 'yaml', value: 'a' })
  })

  test('the value is raw: indentation, blank lines and fence-like lines kept', () => {
    assert.deepEqual(fm('---\na: |\n  ---\n\n\tb\n--- x\n----\n---'), { type: 'yaml', value: 'a: |\n  ---\n\n\tb\n--- x\n----' })
    assert.deepEqual(fm('+++\na = "..."\n...\n---\n+++'), { type: 'toml', value: 'a = "..."\n...\n---' })
    assert.deepEqual(fm('---\n# not a heading\n> nor a quote\n---'), { type: 'yaml', value: '# not a heading\n> nor a quote' })
    assert.deepEqual(fm('---\nTitle\n===\n\n---'), { type: 'yaml', value: 'Title\n===\n' })
  })

  test('line endings are normalized', () => {
    assert.deepEqual(fm('---\r\na: 1\r\nb: 2\r\n---\r\nc'), { type: 'yaml', value: 'a: 1\nb: 2' })
    assert.deepEqual(fm('---\ra\r---\rc'), { type: 'yaml', value: 'a' })
    assert.equal(md.render('---\r\na\r\n---\r\nc'), '<p>c</p>\n')
  })

  test('what follows is parsed normally from the next line', () => {
    assert.equal(md.render('---\na\n---\n---'), '<hr />\n')
    assert.equal(md.render('---\na\n---\n==='), '<p>===</p>\n')
    assert.equal(md.render('---\na\n---\nTitle\n---'), '<h2>Title</h2>\n')
    assert.equal(md.render('---\na\n---\n\n    code'), '<pre><code>code\n</code></pre>\n')
  })

  test('AST shape', () => {
    assert.deepEqual(md.parse('---\na: 1\n---\n# H'), {
      type: 'root',
      children: [
        { type: 'yaml', value: 'a: 1' },
        { type: 'heading', depth: 1, children: [{ type: 'text', value: 'H' }] },
      ],
    })
    assert.deepEqual(md.parse('+++\n+++'), { type: 'root', children: [{ type: 'toml', value: '' }] })
  })

  test('nothing is rendered, whatever the classes map says', () => {
    const styled = createMarkdown({ plugins: [frontmatter()], classes: { yaml: 'x', toml: 'y' } })
    assert.equal(styled.render('---\na\n---\nb'), '<p>b</p>\n')
    assert.deepEqual(md.toVNodes('---\na\n---').filter(Boolean), [])
  })
})

describe('frontmatter: helper', () => {
  test('returns the type and raw value, or null', () => {
    assert.deepEqual(fm('---\na: 1\n---'), { type: 'yaml', value: 'a: 1' })
    assert.equal(fm('# no front matter'), null)
    assert.equal(fm(''), null)
    assert.equal(getFrontmatter(core.parse('---\na\n---')), null)
  })

  test('returns a copy', () => {
    const root = md.parse('---\na\n---')
    const data = getFrontmatter(root)!
    data.value = 'changed'
    assert.deepEqual(root.children[0], { type: 'yaml', value: 'a' })
  })
})

describe('frontmatter: not front matter', () => {
  // Each of these must parse exactly as without the plugin.
  const same = (src: string) => {
    assert.equal(md.render(src), core.render(src), JSON.stringify(src))
    assert.deepEqual(md.parse(src), core.parse(src), JSON.stringify(src))
    assert.equal(fm(src), null)
  }

  test('without the plugin: a thematic break and a setext heading', () => {
    assert.equal(core.render('---\na\n---'), '<hr />\n<h2>a</h2>\n')
  })

  test('unclosed: the document parses normally', () => {
    assert.equal(md.render('---'), '<hr />\n')
    assert.equal(md.render('---\ntitle: x\n\n# Hi'), '<hr />\n<p>title: x</p>\n<h1>Hi</h1>\n')
    for (const s of ['---', '---\n', '---\na', '+++', '+++\na = 1\n', '---\n\n\n', '---\na\n\nb\n\n']) same(s)
  })

  test('unclosed: the wrong closer', () => {
    assert.equal(md.render('+++\nx\n---'), '<h2>+++\nx</h2>\n')
    for (const s of ['---\na\n+++', '+++\nx\n---', '+++\na\n...', '---\na\n ---', '---\na\n--- b', '---\na\n----', '---\na\n -- -']) same(s)
  })

  test('unclosed: everything else still works (references, lists, code, line endings)', () => {
    for (const s of [
      '---\n[x]: /u\n\n[x]',
      '---\n- a\n- b\n\n- c',
      '---\n```\ncode',
      '---\n> q\nlazy',
      '---\n    code\n',
      '---\r\na\r\n\r\n*b*',
      '---\nTitle\n===\n\n***',
    ]) {
      same(s)
    }
  })

  test('the opener must be exactly --- or +++', () => {
    for (const s of ['----\na\n----', '--- x\na\n---', '---x\na\n---', '- - -\na\n- - -', '++\na\n++', '++++\na\n++++', '...\na\n...']) same(s)
  })

  test('only at line 1, column 1', () => {
    for (const s of [' ---\na\n---', '   ---\na\n---', '    ---\na\n---', '\t---\na\n---', '\n---\na\n---', 'a\n\n---\nb\n---', '# h\n---\na\n---']) same(s)
  })

  test('never inside a blockquote or a list item', () => {
    for (const s of ['> ---\n> a\n> ---', '>---\na\n---', '1. ---\n   a\n   ---', '* ---\n  a\n  ---', '- +++\n  a\n  +++']) same(s)
  })

  test('a fresh parse each time (no state on the plugin)', () => {
    assert.equal(md.render('---\na'), '<hr />\n<p>a</p>\n')
    assert.deepEqual(fm('---\na\n---'), { type: 'yaml', value: 'a' })
    assert.equal(md.render('---\na'), '<hr />\n<p>a</p>\n')
  })
})

describe('frontmatter: raw content', () => {
  test('defines no link references', () => {
    assert.equal(md.render('---\n[x]: /u\n---\n[x]'), '<p>[x]</p>\n')
  })

  test('raw HTML inside is neither rendered nor parsed (html: true)', () => {
    const html = createMarkdown({ html: true, plugins: [frontmatter()] })
    assert.equal(html.render('---\n<script>x</script>\n<!--\n---\nb'), '<p>b</p>\n')
  })
})

describe('frontmatter: GFM and other plugins, in both plugin orders', () => {
  const both = (plugins: ReturnType<typeof gfm>) => [
    createMarkdown({ plugins: [frontmatter(), ...plugins] }),
    createMarkdown({ plugins: [...plugins, frontmatter()] }),
  ]
  const check = (instances: ReturnType<typeof both>, src: string, html: string, data: ReturnType<typeof getFrontmatter>) => {
    for (const m of instances) {
      assert.equal(m.render(src), html, JSON.stringify(src))
      assert.deepEqual(getFrontmatter(m.parse(src)), data)
    }
  }
  const withGfm = both(gfm())
  const gfmOnly = createMarkdown({ plugins: gfm() })
  const table = '<table>\n<thead>\n<tr>\n<th>a</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n</tr>\n</tbody>\n</table>\n'

  test('table rows do not take the fences; tables inside stay raw', () => {
    check(withGfm, '---\n| a |\n|---|\n| 1 |\n---\nx', '<p>x</p>\n', { type: 'yaml', value: '| a |\n|---|\n| 1 |' })
    check(withGfm, '---\nk: v\n---\n| a |\n|---|\n| 1 |', table, { type: 'yaml', value: 'k: v' })
    check(withGfm, '| a |\n|---|\n| 1 |', table, null)
  })

  test('footnote definitions inside are not registered', () => {
    check(withGfm, '---\n[^1]: note\n---\nref[^1]', '<p>ref[^1]</p>\n', { type: 'yaml', value: '[^1]: note' })
  })

  test('unclosed: same output as GFM alone (footnotes registered once)', () => {
    for (const src of ['---\n[^1]: note\n\nref[^1]', '---\n| a |\n|---|\n| 1 |', '---\n- [x] done\n\n> [!NOTE]\n> n']) {
      for (const m of withGfm) assert.equal(m.render(src), gfmOnly.render(src), JSON.stringify(src))
    }
  })

  test('containers, headings and mark', () => {
    const others = both([container(), headings(), mark()])
    check(others, '---\n::: note\ntitle: ==x==\n---\n# ==H==', '<h1 id="h"><mark>H</mark></h1>\n', { type: 'yaml', value: '::: note\ntitle: ==x==' })
    check(others, '---\n::: note\nx', '<hr />\n<div class="md-container md-container-note">\n<p>x</p>\n</div>\n', null)
  })
})

describe('frontmatter: pathological inputs', () => {
  const N = 30_000
  const all = createMarkdown({ html: true, plugins: [frontmatter(), ...gfm(), container()] })
  const cases: Array<[string, string]> = [
    ['unclosed, long document (parsed twice at most)', '---\n' + 'a *b* [c]\n'.repeat(N * 3)],
    ['unclosed, nested blockquotes', '---\n' + '> '.repeat(1000) + 'a'],
    ['unclosed, many link openers', '---\n' + '[a'.repeat(N)],
    ['unclosed, many open/close containers', '---\n' + '::: a\nx\n:::\n'.repeat(N)],
    ['near-miss closers', '---\n' + '--- x\n'.repeat(N)],
    ['near-miss closers with long trailing space', '---\n' + ('---' + ' '.repeat(1000) + 'x\n').repeat(1000)],
    ['opener with long trailing space', '---' + ' '.repeat(N * 10) + 'x\n---'],
    ['long front matter', '---\n' + 'key: value\n'.repeat(N * 3) + '---\nbody'],
    ['many fences', '---\n'.repeat(N)],
    ['many TOML fences', '+++\n'.repeat(N)],
    ['many ... lines', '---\n' + '...x\n'.repeat(N)],
    ['fences in nested blockquotes', '> ---\n'.repeat(N)],
  ]
  for (const [name, input] of cases) {
    test(name, () => {
      const t0 = performance.now()
      all.render(input)
      const ms = performance.now() - t0
      assert.ok(ms < 2000, `${name}: ${ms.toFixed(0)} ms`)
    })
  }
})
