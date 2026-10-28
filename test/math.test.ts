import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { decodeEntity } from '../src/entities/index.ts'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown, h } from '../src/index.ts'
import { container } from '../src/plugins/container.ts'
import { math } from '../src/plugins/math.ts'
import { normalize } from './helpers.ts'

const md = createMarkdown({ plugins: [math()] })
const inline = (tex: string) => `<span class="math math-inline">${tex}</span>`
const display = (tex: string) => `<span class="math math-display">${tex}</span>`
const block = (tex: string) => `<div class="math math-display">\n${tex}\n</div>\n`
const p = (html: string) => `<p>${html}</p>\n`

describe('math: inline $…$', () => {
  test('renders as a span, TeX escaped', () => {
    assert.equal(md.render('$x^2$ and $a < b \\& c$'), p(`${inline('x^2')} and ${inline('a &lt; b \\&amp; c')}`))
  })

  test('content is raw TeX: no Markdown, entities or HTML inside', () => {
    assert.equal(md.render('$*a* [l](/u) `c` &amp; \\_$'), p(inline('*a* [l](/u) `c` &amp;amp; \\_')))
    assert.equal(createMarkdown({ html: true, plugins: [math()] }).render('$<b>x</b>$'), p(inline('&lt;b&gt;x&lt;/b&gt;')))
  })

  test('a backslash keeps the next char: \\$ and escaped spaces do not end it', () => {
    assert.equal(md.render('$\\$5$'), p(inline('\\$5')))
    assert.equal(md.render('$a\\\\$'), p(inline('a\\\\')))
    assert.equal(md.render('$\\{x\\}$'), p(inline('\\{x\\}')))
    assert.equal(md.render('$a\\ $'), p(inline('a\\ ')))
  })

  test('may span a soft line break (kept as is, no hard break)', () => {
    assert.equal(md.render('$a\nb$'), p(inline('a\nb')))
    assert.equal(md.render('$a  \nb$'), p(inline('a  \nb')))
  })

  test('inside emphasis, links and headings; any non-digit may follow', () => {
    assert.equal(
      md.render('*$x$* [$y$](/u) **a $z$**'),
      p(`<em>${inline('x')}</em> <a href="/u">${inline('y')}</a> <strong>a ${inline('z')}</strong>`),
    )
    assert.equal(md.render('# $E=mc^2$'), `<h1>${inline('E=mc^2')}</h1>\n`)
    assert.equal(md.render('$x$-th, $y$.'), p(`${inline('x')}-th, ${inline('y')}.`))
  })

  test('the next unescaped $ decides: prices before a formula stay text', () => {
    assert.equal(md.render('I have $5 and you have $3. The sum is $x$.'), p(`I have $5 and you have $3. The sum is ${inline('x')}.`))
  })

  test('AST shape', () => {
    assert.deepEqual(md.parse('a $x$ b').children, [
      { type: 'paragraph', children: [{ type: 'text', value: 'a ' }, { type: 'inlineMath', value: 'x' }, { type: 'text', value: ' b' }] },
    ])
  })
})

describe('math: inline, not math', () => {
  test('without the plugin it is text', () => {
    assert.equal(createMarkdown().render('$x$ $$y$$'), p('$x$ $$y$$'))
  })

  test('currency', () => {
    assert.equal(md.render('$5 and $6'), p('$5 and $6'))
    assert.equal(md.render('Costs $5, $10 or $20.'), p('Costs $5, $10 or $20.'))
  })

  test('opener followed by whitespace, closer preceded by whitespace or followed by a digit', () => {
    for (const s of ['$ x$', '$x $', '$x$5', '$\nx$', '$x\n$']) assert.equal(md.render(s), p(s), s)
  })

  test('unclosed, or a lone $', () => {
    for (const s of ['$x', 'x$', '$', 'a $ b']) assert.equal(md.render(s), p(s), s)
  })

  test('\\$ is a literal dollar outside math', () => {
    assert.equal(md.render('\\$x\\$'), p('$x$'))
    assert.equal(md.render('\\$x$'), p('$x$'))
    assert.equal(md.render('$x\\$'), p('$x$'))
  })

  test('runs of three or more dollars are text', () => {
    assert.equal(md.render('a $$$ b $$$x$$$'), p('a $$$ b $$$x$$$'))
  })

  test('like two code spans, the one that starts first wins', () => {
    assert.equal(md.render('`$x$` $`y`$'), p(`<code>$x$</code> ${inline('`y`')}`))
    assert.equal(md.render('$a `b$`'), p(`${inline('a `b')}\``))
  })
})

describe('math: $$…$$ inside a paragraph', () => {
  test('display math in a span; spaces trimmed', () => {
    assert.equal(md.render('a $$ x^2 $$ b'), p(`a ${display('x^2')} b`))
  })

  test('a single $ inside does not close it', () => {
    assert.equal(md.render('$$a $b$ c$$'), p(display('a $b$ c')))
  })

  test('may span lines that do not start with $$', () => {
    assert.equal(md.render('where $$a\n= b$$ holds'), p(`where ${display('a\n= b')} holds`))
  })

  test('a one-line $$x$$ is a paragraph, not a block', () => {
    assert.equal(md.render('$$x^2$$'), p(display('x^2')))
  })

  test('blank or unclosed is text', () => {
    for (const s of ['$$ $$', 'a $$x', '$$x$', '$$ a $ b']) assert.equal(md.render(s), p(s), s)
  })

  test('AST shape: inlineMath with display: true', () => {
    assert.deepEqual(md.parse('a $$ x $$').children[0].children, [
      { type: 'text', value: 'a ' },
      { type: 'inlineMath', value: 'x', display: true },
    ])
  })
})

describe('math: $$ blocks', () => {
  test('renders as a div, TeX escaped', () => {
    assert.equal(md.render('$$\n\\frac{1}{2} < x\n$$'), block('\\frac{1}{2} &lt; x'))
  })

  test('content is raw, blank lines included', () => {
    assert.equal(md.render('$$\n# a\n\n- b\n*c*\n$$'), block('# a\n\n- b\n*c*'))
    assert.equal(md.render('$$\n```\n$$'), block('```'))
  })

  test('AST shape: value without the final line ending, meta null', () => {
    assert.deepEqual(md.parse('$$\na\nb\n$$').children, [{ type: 'math', meta: null, value: 'a\nb' }])
    assert.deepEqual(md.parse('$$\n$$').children, [{ type: 'math', meta: null, value: '' }])
    assert.equal(md.render('$$\n$$'), '<div class="math math-display">\n</div>\n')
  })

  test('rest of the opening line is meta: trimmed, escapes and entities resolved, not rendered', () => {
    assert.deepEqual(md.parse('$$  eq:1 \\& &amp; x  \nx\n$$').children, [{ type: 'math', meta: 'eq:1 & & x', value: 'x' }])
    assert.equal(md.render('$$ eq:1\nx\n$$'), block('x'))
  })

  test('a $ in the opening line makes it a paragraph', () => {
    assert.equal(md.render('$$ a $$\nb'), p(`${display('a')}\nb`))
  })

  test('up to 3 spaces of indentation; content loses up to the opener indentation', () => {
    assert.equal(md.render('   $$\n   a\n  b\n    c\n   $$'), block('a\nb\n c'))
    assert.equal(md.render('$$\tm\n\tx\n$$\t'), block('\tx'))
  })

  test('4 spaces: indented code, or content inside the block', () => {
    assert.equal(md.render('    $$\n    x'), '<pre><code>$$\nx\n</code></pre>\n')
    assert.equal(md.render('$$\n    $$\n$$'), block('    $$'))
  })

  test('closer: at least as many dollars, then only spaces', () => {
    assert.equal(md.render('$$$\n$$\n$$$$'), block('$$'))
    assert.equal(md.render('$$\nx\n$$   \ny'), block('x') + p('y'))
    assert.equal(md.render('$$\nx\n$$ (1)\n$$'), block('x\n$$ (1)'))
  })

  test('interrupts a paragraph; text after the closer is a new paragraph', () => {
    assert.equal(md.render('a\n$$\nx\n$$\nb'), p('a') + block('x') + p('b'))
  })

  test('documented limit: a line starting with $$ opens a block even inside a paragraph', () => {
    assert.equal(md.render('where $$\nx\n$$ and so on'), p('where $$\nx') + '<div class="math math-display">\n</div>\n')
  })

  test('inside a blockquote and a list item', () => {
    assert.equal(md.render('> $$\n> x\n> $$\n> y'), `<blockquote>\n${block('x')}${p('y')}</blockquote>\n`)
    assert.equal(md.render('- $$\n  x\n  $$\n- b'), `<ul>\n<li>\n${block('x')}</li>\n<li>b</li>\n</ul>\n`)
  })

  test('unclosed: runs to the end of the document or of its container', () => {
    assert.equal(md.render('$$\nx\n\ny'), block('x\n\ny'))
    assert.equal(md.render('> $$\n> x\n\ny'), `<blockquote>\n${block('x')}</blockquote>\n${p('y')}`)
    assert.equal(md.render('- $$\n  x\n- y'), `<ul>\n<li>\n${block('x')}</li>\n<li>y</li>\n</ul>\n`)
  })

  test('a fenced code block keeps its $$ lines', () => {
    assert.equal(md.render('```\n$$\n```'), '<pre><code>$$\n</code></pre>\n')
  })
})

describe('math: render option', () => {
  const src = '$a$ $$b$$\n\n$$\nc\n$$'

  test('string: trusted HTML inside the default element, receives tex and display', () => {
    const calls: unknown[] = []
    const md2 = createMarkdown({
      plugins: [
        math({
          render: (tex, isDisplay) => {
            calls.push([tex, isDisplay])
            return `<b>${tex}</b>`
          },
        }),
      ],
    })
    assert.equal(md2.render(src), p(`${inline('<b>a</b>')} ${display('<b>b</b>')}`) + block('<b>c</b>'))
    assert.deepEqual(calls, [['a', false], ['b', true], ['c', true]])
  })

  test('VNodes: safe path, text still escaped, no raw HTML in the tree', () => {
    const md2 = createMarkdown({ plugins: [math({ render: (tex, isDisplay) => (isDisplay ? [h('i', null, '='), tex] : h('em', null, tex)) })] })
    assert.equal(md2.render('$a<b$\n\n$$\nc\n$$'), p(inline('<em>a&lt;b</em>')) + block('<i>=</i>c'))
    assert.ok(!JSON.stringify(md2.toVNodes(src)).includes('"raw"'))
  })

  test('null or undefined falls back to the default; plugin render overrides still win', () => {
    assert.equal(createMarkdown({ plugins: [math({ render: () => null })] }).render('$a<b$'), p(inline('a&lt;b')))
    assert.equal(createMarkdown({ plugins: [math({ render: () => undefined })] }).render('$$\nx\n$$'), block('x'))
    const md2 = createMarkdown({ plugins: [math({ render: () => 'ignored' }), { name: 'x', render: { inlineMath: (n) => `[${n.value}]` } }] })
    assert.equal(md2.render('$a$'), p('[a]'))
  })

  test('classes map applies to the elements', () => {
    const md2 = createMarkdown({ plugins: [math()], classes: { inlineMath: 'i', math: 'm' } })
    assert.equal(md2.render('$a$\n\n$$\nb\n$$'), p('<span class="math math-inline i">a</span>') + '<div class="math math-display m">\nb\n</div>\n')
  })
})

describe('math: interaction with core, GFM and containers', () => {
  test('GFM, in any plugin order: math in cells, a $$ line ends a table', () => {
    const src = '| a | b |\n|---|---|\n| $x$ | $a\\|b$ |\n$$\ny\n$$\nafter'
    const out =
      '<table>\n<thead>\n<tr>\n<th>a</th>\n<th>b</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n' +
      `<td>${inline('x')}</td>\n<td>${inline('a|b')}</td>\n</tr>\n</tbody>\n</table>\n` +
      block('y') +
      p('after')
    assert.equal(createMarkdown({ plugins: [...gfm(), math()] }).render(src), out)
    assert.equal(createMarkdown({ plugins: [math(), ...gfm()] }).render(src), out)
  })

  test('GFM: strikethrough around math, no autolinks inside it', () => {
    const md2 = createMarkdown({ plugins: [...gfm(), math()] })
    assert.equal(
      md2.render('~~$x$~~ $www.example.com$ www.example.com'),
      p(`<del>${inline('x')}</del> ${inline('www.example.com')} <a href="http://www.example.com">www.example.com</a>`),
    )
  })

  test('containers, in any plugin order: each keeps the other one\'s fence as content', () => {
    for (const plugins of [[container(), math()], [math(), container()]]) {
      const md2 = createMarkdown({ plugins })
      assert.equal(md2.render('::: note\n$$\n:::\n$$\n:::'), `<div class="md-container md-container-note">\n${block(':::')}</div>\n`)
      assert.equal(md2.render('$$\n::: note\n$$'), block('::: note'))
    }
  })

  test('every CommonMark example renders as without the plugin', () => {
    const examples: Array<{ markdown: string; html: string }> = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2.json', import.meta.url), 'utf8'))
    const md2 = createMarkdown({ html: true, decodeEntity, allowUrl: () => true, plugins: [math()] })
    assert.deepEqual(
      examples.filter((ex) => md2.render(ex.markdown) !== ex.html).map((ex) => ex.markdown),
      [],
    )
  })

  test('every GFM example renders as without the plugin, in any plugin order', () => {
    const examples: Array<{ markdown: string; html: string }> = JSON.parse(readFileSync(new URL('./fixtures/gfm.json', import.meta.url), 'utf8'))
    const base = createMarkdown({ html: true, decodeEntity, allowUrl: () => true, plugins: gfm({ alerts: false }) })
    for (const plugins of [[...gfm({ alerts: false }), math()], [math(), ...gfm({ alerts: false })]]) {
      const md2 = createMarkdown({ html: true, decodeEntity, allowUrl: () => true, plugins })
      assert.deepEqual(
        examples.filter((ex) => normalize(md2.render(ex.markdown)) !== normalize(base.render(ex.markdown))).map((ex) => ex.markdown),
        [],
      )
    }
  })
})

describe('math: pathological inputs', () => {
  const N = 50_000
  const all = createMarkdown({ html: true, plugins: [...gfm(), container(), math()] })
  const cases: Array<[string, string]> = [
    ['100k dollars on a line (one long fence)', '$'.repeat(100_000)],
    ['100k dollars inside a paragraph', 'a' + '$'.repeat(100_000)],
    ['$$ lines (open/close)', '$$\n'.repeat(N)],
    ['$$ lines with meta (one unclosed block)', '$$ m\n'.repeat(N)],
    ['$$ lines alternating with text', '$$\nx\n'.repeat(N)],
    ['unclosed block', '$$\n' + 'x\n'.repeat(N)],
    ['alternating $a', '$a'.repeat(N)],
    ['openers before whitespace', '$ '.repeat(N)],
    ['closers after whitespace', 'a $'.repeat(N)],
    ['closers before digits', '$5'.repeat(N)],
    ['unclosed opener, long text', '$' + 'a'.repeat(N * 10)],
    ['many unclosed openers (escaped dollars)', '$a\\'.repeat(N)],
    ['unclosed $$, long text', '$$a' + 'b'.repeat(N * 10)],
    ['$$ with escaped dollars', 'a $$' + '\\$'.repeat(N)],
    ['blank $$ pairs', 'a ' + '$$ '.repeat(N)],
    ['$$ then single dollars', 'a $$' + ' $x'.repeat(N)],
    ['long space run after a fence', ('$$' + ' '.repeat(1000) + 'x\n').repeat(1000)],
    ['long fence, then shorter closers', '$'.repeat(1000) + '\n' + ('$'.repeat(999) + '\n').repeat(1000)],
    ['long dollar runs in paragraph lines', ('$'.repeat(1000) + ' x$\n').repeat(1000)],
    ['blocks in nested blockquotes', '> $$\n'.repeat(N)],
    ['deep nesting, then many content lines', '> '.repeat(100) + '$$\n' + ('> '.repeat(100) + '$x$\n').repeat(1000)],
    ['deep containers, then $$ lines', '::: a\n'.repeat(100) + '$$\n'.repeat(N)],
    ['blocks in nested lists', Array.from({ length: 1000 }, (_, i) => ' '.repeat(i * 2) + '- $$').join('\n')],
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
