import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown } from '../src/index.ts'
import { container } from '../src/plugins/container.ts'
import { budget } from './helpers.ts'

const md = createMarkdown({ plugins: [container()] })
const open = (kind: string) => `<div class="md-container md-container-${kind}">\n`

describe('container: syntax', () => {
  test('kind, title and block content', () => {
    assert.equal(
      md.render('::: warning Optional title\nAny **block** content here.\n:::'),
      open('warning') + '<p class="md-container-title">Optional title</p>\n<p>Any <strong>block</strong> content here.</p>\n</div>\n',
    )
  })

  test('AST shape', () => {
    assert.deepEqual(md.parse('::: Note  My *title*  \nx\n:::').children, [
      { type: 'container', kind: 'note', title: 'My *title*', children: [{ type: 'paragraph', children: [{ type: 'text', value: 'x' }] }] },
    ])
    assert.deepEqual(md.parse(':::tip\n:::').children, [{ type: 'container', kind: 'tip', title: null, children: [] }])
  })

  test('title is plain text: escapes and entities resolved, then escaped on output', () => {
    assert.equal(md.render('::: a \\*x\\* &amp; <b>\n:::'), open('a') + '<p class="md-container-title">*x* &amp; &lt;b&gt;</p>\n</div>\n')
  })

  test('up to 3 spaces of indentation, tabs, longer closers', () => {
    assert.equal(md.render('   :::\tnote\nx\n   :::::\t\ny'), open('note') + '<p>x</p>\n</div>\n<p>y</p>\n')
  })

  test('content is parsed as blocks', () => {
    assert.equal(
      md.render('::: note\n# H\n- a\n- b\n\n> q\n\n    code\n:::'),
      open('note') + '<h1>H</h1>\n<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n<blockquote>\n<p>q</p>\n</blockquote>\n<pre><code>code\n</code></pre>\n</div>\n',
    )
  })

  test('a fenced code block keeps its ::: lines', () => {
    assert.equal(md.render('::: note\n```\n:::\n```\n:::'), open('note') + '<pre><code>:::\n</code></pre>\n</div>\n')
  })

  test('opener interrupts a paragraph, closer ends one', () => {
    assert.equal(md.render('a\n::: note\nb\n:::\nc'), '<p>a</p>\n' + open('note') + '<p>b</p>\n</div>\n<p>c</p>\n')
  })

  test('open children are finalized by the closer (reference definitions work)', () => {
    assert.equal(md.render('::: note\n[x]: /u\n:::\n\n[x]'), open('note') + '</div>\n<p><a href="/u">x</a></p>\n')
  })

  test('inside a blockquote and a list item', () => {
    assert.equal(md.render('> ::: a\n> x\n> :::\n> y'), '<blockquote>\n' + open('a') + '<p>x</p>\n</div>\n<p>y</p>\n</blockquote>\n')
    assert.equal(md.render('- ::: a\n  x\n  :::\n- b'), '<ul>\n<li>\n' + open('a') + '<p>x</p>\n</div>\n</li>\n<li>b</li>\n</ul>\n')
  })

  test('classes map applies to the container', () => {
    const styled = createMarkdown({ plugins: [container()], classes: { container: 'my-4' } })
    assert.equal(styled.render('::: a\n:::'), '<div class="md-container md-container-a my-4">\n</div>\n')
  })

  test('works with GFM, in any plugin order (table rows do not swallow the closer)', () => {
    const src = '::: a\n| h |\n|---|\n| 1 |\n:::\nafter'
    const out = open('a') + '<table>\n<thead>\n<tr>\n<th>h</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td>1</td>\n</tr>\n</tbody>\n</table>\n</div>\n<p>after</p>\n'
    assert.equal(createMarkdown({ plugins: [...gfm(), container()] }).render(src), out)
    assert.equal(createMarkdown({ plugins: [container(), ...gfm()] }).render(src), out)
  })
})

describe('container: not containers', () => {
  test('without the plugin it is a paragraph', () => {
    assert.equal(createMarkdown().render('::: note\nx\n:::'), '<p>::: note\nx\n:::</p>\n')
  })

  test('malformed openers are text', () => {
    assert.equal(md.render(':: note'), '<p>:: note</p>\n')
    assert.equal(md.render('::: 1x'), '<p>::: 1x</p>\n')
    assert.equal(md.render('::: note-x'), '<p>::: note-x</p>\n')
    assert.equal(md.render(':::note:::'), '<p>:::note:::</p>\n')
  })

  test('a stray closer is text', () => {
    assert.equal(md.render(':::'), '<p>:::</p>\n')
    assert.equal(md.render('a\n:::'), '<p>a\n:::</p>\n')
  })

  test('4 spaces of indentation is indented code', () => {
    assert.equal(md.render('    ::: note'), '<pre><code>::: note\n</code></pre>\n')
    assert.equal(md.render('::: a\nx\n    :::\n:::'), open('a') + '<p>x\n:::</p>\n</div>\n')
  })

  test('a shorter closer, or one with trailing text, does not close', () => {
    assert.equal(md.render(':::: a\n:::\n::::'), open('a') + '<p>:::</p>\n</div>\n')
    assert.equal(md.render('::: a\n::: x y\n:::'), open('a') + open('x') + '<p class="md-container-title">y</p>\n</div>\n</div>\n')
  })

  test('a closer claimed by an inner block does not close the container', () => {
    assert.equal(md.render('::: a\n> :::\n:::'), open('a') + '<blockquote>\n<p>:::</p>\n</blockquote>\n</div>\n')
  })
})

describe('container: nesting', () => {
  test('more colons outside', () => {
    assert.equal(
      md.render(':::: outer\n::: inner\nx\n:::\ny\n::::\nz'),
      open('outer') + open('inner') + '<p>x</p>\n</div>\n<p>y</p>\n</div>\n<p>z</p>\n',
    )
  })

  test('same number of colons: the innermost closes first', () => {
    assert.equal(md.render('::: a\n::: b\nx\n:::\ny\n:::\nz'), open('a') + open('b') + '<p>x</p>\n</div>\n<p>y</p>\n</div>\n<p>z</p>\n')
  })

  test('an outer closer also closes an unclosed inner container', () => {
    assert.equal(md.render('::: a\n:::: b\nx\n:::\ny'), open('a') + open('b') + '<p>x</p>\n</div>\n</div>\n<p>y</p>\n')
  })

  test('nesting is capped at MAX_NESTING', () => {
    const out = md.render('::: a\n'.repeat(150))
    assert.equal(out.split('<div').length - 1, 100)
  })
})

describe('container: unclosed', () => {
  test('runs to the end of the document', () => {
    assert.equal(md.render('::: a\nx\n\ny'), open('a') + '<p>x</p>\n<p>y</p>\n</div>\n')
  })

  test('runs to the end of its parent', () => {
    assert.equal(md.render('> ::: a\n> x\n\ny'), '<blockquote>\n' + open('a') + '<p>x</p>\n</div>\n</blockquote>\n<p>y</p>\n')
    assert.equal(md.render('- ::: a\n  x\n- y'), '<ul>\n<li>\n' + open('a') + '<p>x</p>\n</div>\n</li>\n<li>y</li>\n</ul>\n')
  })

  test('trailing blank lines do not belong to it (list looseness matches blockquotes)', () => {
    const loose = (inner: string) => '<ul>\n<li>\n' + inner + '</li>\n<li>\n<p>b</p>\n</li>\n</ul>\n'
    assert.equal(md.render('- > x\n\n- b'), loose('<blockquote>\n<p>x</p>\n</blockquote>\n'))
    assert.equal(md.render('- ::: a\n  x\n\n- b'), loose(open('a') + '<p>x</p>\n</div>\n'))
  })

  test('an unclosed code fence inside keeps everything', () => {
    assert.equal(md.render('::: a\n```\nx\n:::'), open('a') + '<pre><code>x\n:::\n</code></pre>\n</div>\n')
  })
})

describe('container: pathological inputs', () => {
  const N = 30_000
  const all = createMarkdown({ html: true, plugins: [...gfm(), container()] })
  const cases: Array<[string, string]> = [
    ['many openers', '::: a\n'.repeat(N)],
    ['many stray closers', ':::\n'.repeat(N)],
    ['open/close pairs', '::: a\nx\n:::\n'.repeat(N)],
    ['deep nesting, then long colon lines', '::: a\n'.repeat(100) + (':'.repeat(1000) + 'x\n').repeat(1000)],
    ['deep nesting, then closers with long trailing space', '::: a\n'.repeat(100) + (':::' + ' '.repeat(1000) + 'x\n').repeat(1000)],
    [
      'decreasing fences, then increasing closers',
      // ~1 MB: linear (~130 ms/MB with GFM, whose ':' autolink trigger is
      // dispatched per char); larger inputs only test the CI machine's speed.
      Array.from({ length: 1000 }, (_, i) => ':'.repeat(1003 - i) + ' a').join('\n') + '\n' + Array.from({ length: 1000 }, (_, i) => ':'.repeat(i + 3)).join('\n'),
    ],
    ['long colon run', ':'.repeat(N * 10)],
    ['long space run before the kind', ':::' + ' '.repeat(N * 10) + '1'],
    ['long kind', '::: ' + 'a'.repeat(N * 10) + '1'],
    ['long title', '::: a ' + 'x '.repeat(N * 5)],
    ['containers in nested blockquotes', '> ::: a\n'.repeat(N)],
    ['containers in nested lists', Array.from({ length: 1000 }, (_, i) => ' '.repeat(i * 2) + '- ::: a').join('\n')],
  ]
  for (const [name, input] of cases) {
    test(name, () => {
      const t0 = performance.now()
      all.render(input)
      const ms = performance.now() - t0
      assert.ok(ms < budget(2000), `${name}: ${ms.toFixed(0)} ms`)
    })
  }
})
