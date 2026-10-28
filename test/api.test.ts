import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createMarkdown, h, type Plugin } from '../src/index.ts'

describe('defaults', () => {
  const md = createMarkdown()

  test('raw HTML is not recognized: it renders as text', () => {
    assert.equal(md.render('<script>alert(1)</script>'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n')
    assert.equal(md.render('a <b onclick="x">b</b>'), '<p>a &lt;b onclick=&quot;x&quot;&gt;b&lt;/b&gt;</p>\n')
  })

  test('markdown inside would-be HTML blocks is still parsed', () => {
    assert.equal(md.render('<div>\n*hi*\n</div>'), '<p>&lt;div&gt;\n<em>hi</em>\n&lt;/div&gt;</p>\n')
  })

  test('autolinks still work without html', () => {
    assert.equal(md.render('<https://example.com>'), '<p><a href="https://example.com">https://example.com</a></p>\n')
  })

  test('javascript: URLs are emptied', () => {
    assert.equal(md.render('[x](javascript:alert(1))'), '<p><a href="">x</a></p>\n')
    assert.equal(md.render('[x](JaVaScRiPt:alert(1))'), '<p><a href="">x</a></p>\n')
    assert.equal(md.render('[x](&#106;avascript:alert(1))'), '<p><a href="">x</a></p>\n')
    assert.equal(md.render('<javascript:alert(1)>'), '<p><a href="">javascript:alert(1)</a></p>\n')
    assert.equal(md.render('![x](javascript:alert(1))'), '<p><img src="" alt="x" /></p>\n')
  })

  test('URL policy: allowlisted schemes are kept', () => {
    assert.equal(md.render('[a](tel:+390612345) [b](sms:+390612345) [c](mailto:a@b.c)'), '<p><a href="tel:+390612345">a</a> <a href="sms:+390612345">b</a> <a href="mailto:a@b.c">c</a></p>\n')
    assert.equal(md.render('[a](TEL:123) [b](Https://x.y)'), '<p><a href="TEL:123">a</a> <a href="Https://x.y">b</a></p>\n')
  })

  test('URL policy: anything outside the allowlist is emptied', () => {
    for (const url of ['vbscript:msgbox(1)', 'file:///etc/passwd', 'ftp://x.y/f', 'vscode://open', 'about:blank']) {
      assert.equal(md.render(`[x](${url})`), '<p><a href="">x</a></p>\n', url)
    }
  })

  test('URL policy: data: only for raster images', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo='
    assert.equal(md.render(`![x](${png})`), `<p><img src="${png}" alt="x" /></p>\n`)
    assert.equal(md.render('![x](data:image/webp;base64,UklGRg==)'), '<p><img src="data:image/webp;base64,UklGRg==" alt="x" /></p>\n')
    assert.equal(md.render(`[x](${png})`), '<p><a href="">x</a></p>\n') // not as a link
    assert.equal(md.render('![x](data:image/svg+xml;base64,PHN2Zz4=)'), '<p><img src="" alt="x" /></p>\n') // SVG can script
    assert.equal(md.render('![x](data:text/html;base64,PHNjcmlwdD4=)'), '<p><img src="" alt="x" /></p>\n')
    assert.equal(md.render('![x](data:image/pngx;base64,AA==)'), '<p><img src="" alt="x" /></p>\n')
  })

  test('relative and http(s) URLs are kept', () => {
    assert.equal(md.render('[a](/path) [b](#frag) [c](https://x.y)'), '<p><a href="/path">a</a> <a href="#frag">b</a> <a href="https://x.y">c</a></p>\n')
  })

  test('entity names never resolve to Object.prototype members', () => {
    assert.equal(md.render('&constructor; &toString; &hasOwnProperty;'), '<p>&amp;constructor; &amp;toString; &amp;hasOwnProperty;</p>\n')
  })

  test('a leading byte order mark is ignored', () => {
    assert.equal(md.render('\uFEFF# Title'), '<h1>Title</h1>\n')
  })

  test('basic named entities decode without a DOM', () => {
    assert.equal(md.render('&amp; &lt; &copy;'), '<p>&amp; &lt; &amp;copy;</p>\n')
  })
})

describe('options', () => {
  test('html: true passes raw HTML through, and sanitize runs on the output', () => {
    const md = createMarkdown({ html: true, sanitize: (s) => s.replace(/<script[\s\S]*?<\/script>/g, '') })
    assert.equal(md.render('<script>x</script>\n\nok'), '\n<p>ok</p>\n')
  })

  test('custom allowUrl', () => {
    const md = createMarkdown({ allowUrl: (url, kind) => kind === 'image' || url.startsWith('/') })
    assert.equal(md.render('[a](/x) [b](https://y) ![c](https://z)'), '<p><a href="/x">a</a> <a href="">b</a> <img src="https://z" alt="c" /></p>\n')
  })

  test('classes map adds classes per node type and heading level', () => {
    const md = createMarkdown({ classes: { heading: 'font-bold', heading1: 'text-3xl', paragraph: 'my-4', code: 'p-4' } })
    assert.equal(md.render('# T\n\np\n\n```js\nx\n```'), '<h1 class="font-bold text-3xl">T</h1>\n<p class="my-4">p</p>\n<pre class="p-4"><code class="language-js">x\n</code></pre>\n')
  })

  test('classes do not apply to paragraphs in tight lists (no element)', () => {
    const md = createMarkdown({ classes: { paragraph: 'my-4', listItem: 'ml-4' } })
    assert.equal(md.render('- a\n- b'), '<ul>\n<li class="ml-4">a</li>\n<li class="ml-4">b</li>\n</ul>\n')
  })
})

describe('AST', () => {
  const md = createMarkdown()

  test('mdast-style nodes', () => {
    const root = md.parse('# Hi *there*\n\n1. a\n2. b\n\n```ts meta here\ncode\n```')
    assert.deepEqual(root, {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: 'Hi ' }, { type: 'emphasis', children: [{ type: 'text', value: 'there' }] }] },
        {
          type: 'list',
          ordered: true,
          start: 1,
          spread: false,
          children: [
            { type: 'listItem', spread: false, children: [{ type: 'paragraph', children: [{ type: 'text', value: 'a' }] }] },
            { type: 'listItem', spread: false, children: [{ type: 'paragraph', children: [{ type: 'text', value: 'b' }] }] },
          ],
        },
        { type: 'code', lang: 'ts', meta: 'meta here', value: 'code\n' },
      ],
    })
  })

  test('soft breaks are newlines inside text', () => {
    assert.deepEqual(md.parse('a\nb').children[0], { type: 'paragraph', children: [{ type: 'text', value: 'a\nb' }] })
  })

  test('render accepts an AST', () => {
    const root = md.parse('*x*')
    assert.equal(md.render(root), '<p><em>x</em></p>\n')
  })
})

describe('plugins', () => {
  test('delimiter rule: ==highlight==', () => {
    const mark: Plugin = {
      name: 'mark',
      delimiters: [{ char: '=', type: 'mark', sizes: [2] }],
      render: { mark: (n, r) => r.h('mark', null, r.children(n)) },
    }
    const md = createMarkdown({ plugins: [mark] })
    assert.equal(md.render('a ==b *c*== d'), '<p>a <mark>b <em>c</em></mark> d</p>\n')
    assert.equal(md.render('a =b= ===c==='), '<p>a =b= ===c===</p>\n')
  })

  test('inline rule with a trigger char: @mentions', () => {
    const mention: Plugin = {
      name: 'mention',
      inline: [
        {
          name: 'mention',
          triggers: '@',
          parse(p) {
            const m = p.match(/@([a-z0-9_]+)/y)
            if (!m) return false
            p.push({ type: 'mention', user: m.slice(1) })
            return true
          },
        },
      ],
      render: { mention: (n, r) => r.h('a', { href: `/u/${n.user}`, class: 'mention' }, `@${n.user}`) },
    }
    const md = createMarkdown({ plugins: [mention] })
    assert.equal(md.render('hi @bob!'), '<p>hi <a href="/u/bob" class="mention">@bob</a>!</p>\n')
    assert.equal(md.render('`@bob`'), '<p><code>@bob</code></p>\n')
  })

  test('block rule: $$ math fences', () => {
    const math: Plugin = {
      name: 'math',
      block: [
        {
          name: 'math',
          triggers: '$',
          before: 'fencedCode',
          acceptsLines: true,
          start(p) {
            if (p.indented || !p.rest().startsWith('$$')) return 0
            p.closeUnmatchedBlocks()
            p.addChild('math', p.nextNonspace)
            p.advanceOffset(p.line.length - p.offset)
            return 2
          },
          continue(p, b) {
            if (p.rest().startsWith('$$')) {
              p.finalize(b, p.lineNumber)
              return 2
            }
            return 0
          },
          finalize(_p, b) {
            b.node.value = b.content.replace(/^\n/, '')
          },
        },
      ],
      render: { math: (n, r) => r.h('div', { class: 'math' }, n.value as string) },
    }
    const md = createMarkdown({ plugins: [math] })
    assert.equal(md.render('$$\na < b\n$$\n\ntext'), '<div class="math">\na &lt; b\n</div>\n<p>text</p>\n')
  })

  test('render override for a core node', () => {
    const md = createMarkdown({
      plugins: [{ name: 'ext-links', render: { link: (n, r) => r.h('a', { href: r.url(n.url as string, 'link'), rel: 'noopener' }, r.children(n)) } }],
    })
    assert.equal(md.render('[a](https://x)'), '<p><a href="https://x" rel="noopener">a</a></p>\n')
  })

  test('transform: heading ids', () => {
    const md = createMarkdown({
      plugins: [
        {
          name: 'ids',
          transform(root) {
            for (const n of root.children) if (n.type === 'heading') n.id = String((n.children?.[0] as { value?: string })?.value).toLowerCase()
          },
          render: { heading: (n, r) => r.h(`h${n.depth}`, { id: n.id as string }, r.children(n)) },
        },
      ],
    })
    assert.equal(md.render('# Hello'), '<h1 id="hello">Hello</h1>\n')
  })

  test('unknown anchor in before/after throws a helpful error', () => {
    assert.throws(
      () => createMarkdown({ plugins: [{ name: 'x', inline: [{ name: 'x', triggers: '%', before: 'nope', parse: () => false }] }] }),
      /unknown rule "nope"/,
    )
  })

  test('replacing a core rule by name', () => {
    const md = createMarkdown({ plugins: [{ name: 'no-code-spans', inline: [{ name: 'codeSpan', triggers: '`', parse: () => false }] }] })
    assert.equal(md.render('`x`'), '<p>`x`</p>\n')
  })

  test('unknown node types degrade to their children or text', () => {
    const md = createMarkdown()
    assert.equal(md.render({ type: 'root', children: [{ type: 'paragraph', children: [{ type: 'custom', value: 'v' }] }] }), '<p>v</p>\n')
  })
})

describe('gfm extras', async () => {
  const { gfm } = await import('../src/gfm/index.ts')
  const md = createMarkdown({ plugins: gfm() })

  test('alerts', () => {
    assert.equal(
      md.render('> [!WARNING]\n> Mind the *gap*.'),
      '<div class="markdown-alert markdown-alert-warning">\n<p class="markdown-alert-title">Warning</p>\n<p>Mind the <em>gap</em>.</p>\n</div>\n',
    )
    assert.equal(md.render('> [!NOPE]\n> x'), '<blockquote>\n<p>[!NOPE]\nx</p>\n</blockquote>\n')
  })

  test('table alignment and inline content', () => {
    assert.equal(
      md.render('| a | b |\n|:-:|--:|\n| `x\\|y` | **z** |'),
      '<table>\n<thead>\n<tr>\n<th align="center">a</th>\n<th align="right">b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td align="center"><code>x|y</code></td>\n<td align="right"><strong>z</strong></td>\n</tr>\n</tbody>\n</table>\n',
    )
  })

  test('table AST is mdast-shaped', () => {
    const [table] = md.parse('| a |\n|---|\n| 1 |').children
    assert.deepEqual(table, {
      type: 'table',
      align: [null],
      children: [
        { type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: 'a' }] }] },
        { type: 'tableRow', children: [{ type: 'tableCell', children: [{ type: 'text', value: '1' }] }] },
      ],
    })
  })

  test('extensions can be turned off', () => {
    const plain = createMarkdown({ plugins: gfm({ table: false, autolink: false }) })
    assert.equal(plain.render('www.x.com ~~y~~'), '<p>www.x.com <del>y</del></p>\n')
  })

  test('URL autolinks are consumed before emphasis (cmark-gfm behavior)', () => {
    assert.equal(md.render('see https://x.com/__init__.py now'), '<p>see <a href="https://x.com/__init__.py">https://x.com/__init__.py</a> now</p>\n')
    assert.equal(md.render('www.x.org/__a__/b'), '<p><a href="http://www.x.org/__a__/b">www.x.org/__a__/b</a></p>\n')
  })

  test('no autolinks inside link or image text', () => {
    assert.equal(md.render('[http://a.b](http://c.d)'), '<p><a href="http://c.d">http://a.b</a></p>\n')
    assert.equal(md.render('![www.x.y](/i.png)'), '<p><img src="/i.png" alt="www.x.y" /></p>\n')
  })

  test('autolinks pass through the URL policy', () => {
    assert.equal(md.render('see https://x.y/z.'), '<p>see <a href="https://x.y/z">https://x.y/z</a>.</p>\n')
  })
})

describe('highlight option', () => {
  const src = '```js title="x"\nlet a = 1 < 2\n```'

  test('string: trusted HTML inside <code>, receives lang and meta', () => {
    const calls: unknown[] = []
    const md = createMarkdown({
      highlight: (code, lang, meta) => {
        calls.push([code, lang, meta])
        return `<span class="k">let</span> a = 1 &lt; 2\n`
      },
    })
    assert.equal(md.render(src), '<pre><code class="language-js"><span class="k">let</span> a = 1 &lt; 2\n</code></pre>\n')
    assert.deepEqual(calls, [['let a = 1 < 2\n', 'js', 'title="x"']])
  })

  test('string starting with <pre: replaces the whole block (shiki style)', () => {
    const md = createMarkdown({ highlight: () => '<pre class="shiki"><code>x</code></pre>' })
    assert.equal(md.render(`${src}\n\npara`), '<pre class="shiki"><code>x</code></pre>\n<p>para</p>\n')
  })

  test('VNodes: safe path, text still escaped, no raw HTML in the tree', () => {
    const md = createMarkdown({ highlight: (code) => [h('span', { class: 'k' }, code.slice(0, 3)), code.slice(3)] })
    assert.equal(md.render(src), '<pre><code class="language-js"><span class="k">let</span> a = 1 &lt; 2\n</code></pre>\n')
    assert.ok(!JSON.stringify(md.toVNodes(src)).includes('"raw"'))
  })

  test('null falls back to default rendering; plugins still override', () => {
    assert.equal(createMarkdown({ highlight: () => null }).render(src), '<pre><code class="language-js">let a = 1 &lt; 2\n</code></pre>\n')
    const md = createMarkdown({ highlight: () => 'ignored', plugins: [{ name: 'x', render: { code: () => 'plugin' } }] })
    assert.equal(md.render(src), 'plugin')
  })
})

describe('positions and attributes', () => {
  const src = '# Title\n\n> quote\n> more\n\n- a\n  - b\r\n\r\nPara\nline two\n'
  const md = createMarkdown({ positions: true })
  const pos = (n: { position?: { start: { line: number; column: number; offset: number }; end: { line: number; column: number; offset: number } } }) =>
    n.position && [n.position.start.line, n.position.start.column, n.position.start.offset, n.position.end.line, n.position.end.column, n.position.end.offset]

  test('block nodes get unist positions (exact start, end of last line), CRLF aware', () => {
    const root = md.parse(src)
    const [h1, quote, list, para] = root.children
    assert.deepEqual(pos(h1), [1, 1, 0, 1, 8, 7])
    assert.deepEqual(pos(quote), [3, 1, 9, 4, 7, 23])
    assert.deepEqual(pos(quote.children![0]), [3, 3, 11, 4, 7, 23])
    const inner = list.children![0].children![1]
    assert.deepEqual(pos(inner), [7, 3, 31, 7, 6, 34])
    assert.deepEqual(pos(para), [9, 1, 38, 10, 9, 51]) // two CRLFs before it: +2 bytes
    assert.equal(src.slice(para.position!.start.offset, para.position!.end.offset), 'Para\nline two')
  })

  test('inline nodes have no position; off by default', () => {
    assert.equal(md.parse('*a*').children[0].children![0].position, undefined)
    assert.equal(createMarkdown().parse('# a').children[0].position, undefined)
  })

  test('attributes hook: data-sourcepos recipe for editors, merged with classes', () => {
    const md2 = createMarkdown({
      positions: true,
      classes: { paragraph: 'my-4' },
      attributes: (n) => n.position && { 'data-line': n.position.start.line, class: 'synced' },
    })
    assert.equal(md2.render('# T\n\ntext'), '<h1 data-line="1" class="synced">T</h1>\n<p data-line="3" class="synced my-4">text</p>\n')
  })
})
