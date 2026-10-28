import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown } from '../src/index.ts'
import { mark } from '../src/plugins/mark.ts'

const md = createMarkdown({ plugins: [mark()] })
const p = (html: string) => `<p>${html}</p>\n`

describe('mark: syntax', () => {
  test('==text== becomes <mark>', () => {
    assert.equal(md.render('a ==b== c'), p('a <mark>b</mark> c'))
    assert.equal(md.render('==b=='), p('<mark>b</mark>'))
  })

  test('content is inline Markdown and may span lines', () => {
    assert.equal(md.render('==a *b* [c](/u)=='), p('<mark>a <em>b</em> <a href="/u">c</a></mark>'))
    assert.equal(md.render('==a\nb=='), p('<mark>a\nb</mark>'))
  })

  test('inside a word, like `*`', () => {
    assert.equal(md.render('a==b==c'), p('a<mark>b</mark>c'))
  })

  test('single = inside is text; marks nest', () => {
    assert.equal(md.render('==a=b=='), p('<mark>a=b</mark>'))
    assert.equal(md.render('==a ==b== c=='), p('<mark>a <mark>b</mark> c</mark>'))
  })

  test('AST shape', () => {
    assert.deepEqual(md.parse('x ==a *b*==').children, [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'x ' },
          { type: 'mark', children: [{ type: 'text', value: 'a ' }, { type: 'emphasis', children: [{ type: 'text', value: 'b' }] }] },
        ],
      },
    ])
  })

  test('classes map applies to <mark>', () => {
    assert.equal(createMarkdown({ plugins: [mark()], classes: { mark: 'hl' } }).render('==a=='), p('<mark class="hl">a</mark>'))
  })
})

describe('mark: not marks', () => {
  test('without the plugin it is text', () => {
    assert.equal(createMarkdown().render('==a=='), p('==a=='))
  })

  test('runs of other lengths, or unequal runs, stay text', () => {
    for (const s of ['=a=', '===a===', '====a====', '===a==', '==a===']) assert.equal(md.render(s), p(s))
  })

  test('not flanking: spaces inside the delimiters', () => {
    for (const s of ['== a ==', '==a ==', '== a==', 'a = = b']) assert.equal(md.render(s), p(s))
  })

  test('unmatched and lone runs', () => {
    for (const s of ['==', '====', '==a', 'a==']) assert.equal(md.render(s), p(s))
    assert.equal(md.render('==a==b=='), p('<mark>a</mark>b=='))
  })

  test('escapes and entities are not delimiters', () => {
    assert.equal(md.render('\\==a=='), p('==a=='))
    assert.equal(md.render('==a\\=='), p('==a=='))
    assert.equal(md.render('&#61;&#61;a&#61;&#61;'), p('==a=='))
  })

  test('does not cross paragraphs', () => {
    assert.equal(md.render('==a\n\nb=='), p('==a') + p('b=='))
  })
})

describe('mark: interaction with core syntax', () => {
  test('= underlines are still setext headings', () => {
    assert.equal(md.render('Title\n=='), '<h1>Title</h1>\n')
    assert.equal(md.render('Title\n==='), '<h1>Title</h1>\n')
    assert.equal(md.render('a ==\n=='), '<h1>a ==</h1>\n')
    assert.equal(md.render('==\n=='), '<h1>==</h1>\n')
    assert.equal(md.render('Title\n==a=='), p('Title\n<mark>a</mark>'))
    assert.equal(md.render('==a==\n=='), '<h1><mark>a</mark></h1>\n')
  })

  test('inside headings, lists and blockquotes', () => {
    assert.equal(md.render('# ==h=='), '<h1><mark>h</mark></h1>\n')
    assert.equal(md.render('- ==a==\n- b'), '<ul>\n<li><mark>a</mark></li>\n<li>b</li>\n</ul>\n')
    assert.equal(md.render('> ==q=='), '<blockquote>\n' + p('<mark>q</mark>') + '</blockquote>\n')
  })

  test('emphasis nests both ways; overlapping runs resolve like emphasis', () => {
    assert.equal(md.render('**==a==**'), p('<strong><mark>a</mark></strong>'))
    assert.equal(md.render('==**a**=='), p('<mark><strong>a</strong></mark>'))
    assert.equal(md.render('*a ==b* c=='), p('<em>a ==b</em> c=='))
    assert.equal(md.render('==**a==**'), p('<mark>**a</mark>**'))
  })

  test('code spans win', () => {
    assert.equal(md.render('`==a==`'), p('<code>==a==</code>'))
    assert.equal(md.render('==`a`=='), p('<mark><code>a</code></mark>'))
    assert.equal(md.render('==a`==`b'), p('==a<code>==</code>b'))
  })

  test('code blocks are untouched', () => {
    assert.equal(md.render('```\n==a==\n```'), '<pre><code>==a==\n</code></pre>\n')
    assert.equal(md.render('    ==a=='), '<pre><code>==a==\n</code></pre>\n')
  })

  test('links: text may be marked; destinations and autolinks are untouched', () => {
    assert.equal(md.render('[==a==](/u)'), p('<a href="/u"><mark>a</mark></a>'))
    assert.equal(md.render('==[a](/u)=='), p('<mark><a href="/u">a</a></mark>'))
    assert.equal(md.render('[a](/u==x==)'), p('<a href="/u==x==">a</a>'))
    assert.equal(md.render('<https://a.b/?x==y==>'), p('<a href="https://a.b/?x==y==">https://a.b/?x==y==</a>'))
    assert.equal(md.render('==[a==](/u)'), p('==<a href="/u">a==</a>'))
  })

  test('raw HTML attributes are untouched (html: true)', () => {
    const html = createMarkdown({ html: true, plugins: [mark()] })
    assert.equal(html.render('<span title="==a==">==b==</span>'), p('<span title="==a=="><mark>b</mark></span>'))
  })
})

describe('mark: GFM, in both plugin orders', () => {
  const orders = [createMarkdown({ plugins: [mark(), ...gfm()] }), createMarkdown({ plugins: [...gfm(), mark()] })]
  const cases: Array<[string, string]> = [
    ['~~==a==~~', p('<del><mark>a</mark></del>')],
    ['==~~a~~==', p('<mark><del>a</del></mark>')],
    ['~==a==~', p('<del><mark>a</mark></del>')],
    ['==a~~b==c~~', p('<mark>a~~b</mark>c~~')],
    ['| h |\n|---|\n| ==x== |', '<table>\n<thead>\n<tr>\n<th>h</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><mark>x</mark></td>\n</tr>\n</tbody>\n</table>\n'],
    ['- [ ] ==todo==', '<ul>\n<li><input type="checkbox" disabled="" /> <mark>todo</mark></li>\n</ul>\n'],
    ['Title\n==', '<h1>Title</h1>\n'],
  ]
  for (const [src, out] of cases) {
    test(JSON.stringify(src), () => {
      for (const m of orders) assert.equal(m.render(src), out)
    })
  }
})

describe('mark: pathological inputs', () => {
  const N = 30_000
  const all = createMarkdown({ html: true, plugins: [...gfm(), mark()] })
  const cases: Array<[string, string]> = [
    ['long = run', '='.repeat(N * 10)],
    ['many openers with no closers', '==a '.repeat(N)],
    ['many closers with no openers', 'a== '.repeat(N)],
    ['nested marks', '==a '.repeat(N) + 'b' + ' a=='.repeat(N)],
    ['single = between words', 'a=b'.repeat(N)],
    ['runs of the wrong length', '==a= '.repeat(N) + '===a=== '.repeat(N)],
    ['runs of increasing length', Array.from({ length: 700 }, (_, i) => '='.repeat(i + 1) + 'a').join('')],
    ['marks and strikethrough side by side', '==~~a~~== '.repeat(N)],
    ['mark openers inside link openers', '[==a'.repeat(N)],
    ['setext underlines', 'a\n==\n'.repeat(N)],
  ]
  for (const [name, input] of cases) {
    test(name, () => {
      const t0 = performance.now()
      all.render(input)
      const ms = performance.now() - t0
      assert.ok(ms < 2000, `${name}: ${ms.toFixed(0)} ms`)
    })
  }

  test('nesting is capped at MAX_NESTING', () => {
    const out = md.render('==a '.repeat(150) + 'b' + ' a=='.repeat(150))
    assert.equal(out.split('<mark>').length - 1, 100)
  })
})
