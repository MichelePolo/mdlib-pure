import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createMarkdown, type Plugin } from '../src/index.ts'

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

  test('relative and http(s) URLs are kept', () => {
    assert.equal(md.render('[a](/path) [b](#frag) [c](https://x.y)'), '<p><a href="/path">a</a> <a href="#frag">b</a> <a href="https://x.y">c</a></p>\n')
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
