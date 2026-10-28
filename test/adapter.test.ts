import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { toElements } from '../src/adapter.ts'
import { decodeEntity } from '../src/entities/index.ts'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown, h, raw } from '../src/index.ts'
import { normalize } from './helpers.ts'

const fixtures = (name: string): Array<{ markdown: string }> => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))

/** Normalize differences that are only serialization style. */
const same = (html: string): string =>
  normalize(
    html
      .replace(/<link rel="preload" as="image"[^>]*>/g, '') // React 19 SSR hoists image preloads
      .replace(/&#x27;/g, "'")
      .replace(/\ssrc=""/g, ''), // React drops empty src (see adapter)
  ).replace(/\n+(?=<)|(?<=>)\n+/g, '')

describe('adapter: React (real react-dom/server)', () => {
  const md = createMarkdown({ plugins: gfm(), decodeEntity })

  test('every CommonMark and GFM example renders like md.render(), with no React warnings', () => {
    const warnings: string[] = []
    const original = console.error
    console.error = (...args: unknown[]) => warnings.push(String(args[0]))
    const mismatches: string[] = []
    try {
      for (const { markdown } of [...fixtures('commonmark-0.31.2.json'), ...fixtures('gfm.json')]) {
        const tree = md.toVNodes(markdown)
        const viaReact = renderToStaticMarkup(createElement('div', null, ...toElements(tree, createElement, 'react')))
        if (same(viaReact) !== same(`<div>${md.render(markdown)}</div>`)) mismatches.push(markdown)
      }
    } finally {
      console.error = original
    }
    assert.deepEqual(mismatches, [])
    assert.deepEqual([...new Set(warnings)], [])
  })

  test('React conventions: className, defaultChecked, rejected link keeps href=""', () => {
    const tree = createMarkdown({ plugins: gfm(), classes: { list: 'ml-4' } }).toVNodes('- [x] done [bad](javascript:x)')
    const html = renderToStaticMarkup(createElement('div', null, ...toElements(tree, createElement, 'react')))
    assert.equal(html, '<div><ul class="ml-4"><li><input type="checkbox" disabled="" checked=""/> done <a href="">bad</a></li></ul></div>')
  })

  test('raw HTML (e.g. from highlight) uses dangerouslySetInnerHTML in a wrapper', () => {
    const md2 = createMarkdown({ highlight: () => '<span class="k">x</span>' })
    const html = renderToStaticMarkup(createElement('div', null, ...toElements(md2.toVNodes('```js\nx\n```'), createElement)))
    assert.equal(html, '<div><pre><code class="language-js"><span><span class="k">x</span></span></code></pre></div>')
  })
})

describe('adapter: sanitize', () => {
  const evil = '<div onclick="steal()">x</div>\n\n```js\ny\n```'
  const stripHandlers = (html: string) => html.replace(/\son\w+="[^"]*"/g, '')
  const highlight = () => '<span onmouseover="steal()">y</span>'

  test('toVNodes() applies sanitize to every raw node (HTML blocks and highlight output)', () => {
    const md = createMarkdown({ html: true, sanitize: stripHandlers, highlight })
    const html = renderToStaticMarkup(createElement('div', null, ...toElements(md.toVNodes(evil), createElement)))
    assert.ok(!html.includes('steal'), html)
  })

  test('render() still sanitizes the whole string once (inline HTML fragments stay intact)', () => {
    const calls: string[] = []
    const md = createMarkdown({ html: true, sanitize: (s) => (calls.push(s), s) })
    assert.equal(md.render('a <b>c</b>'), '<p>a <b>c</b></p>\n')
    assert.deepEqual(calls, ['<p>a <b>c</b></p>\n'])
  })
})

describe('adapter: Vue and Preact conventions (recording h)', () => {
  type Call = { tag: string; props: Record<string, unknown> | null; children: unknown[] }
  const record = (tag: string, props: Record<string, unknown> | null, ...children: unknown[]): Call => ({ tag, props, children })

  test('Vue: children as a single array, innerHTML for raw, keys on top-level', () => {
    const [p] = toElements([h('p', { class: 'x' }, 'a', h('em', null, 'b')), raw('<i>r</i>', true)], record, 'vue') as Call[]
    assert.deepEqual(p, { tag: 'p', props: { key: 0, class: 'x' }, children: [['a', { tag: 'em', props: {}, children: [['b']] }]] })
    const [, r] = toElements([h('p'), raw('<i>r</i>', true)], record, 'vue') as Call[]
    assert.deepEqual(r, { tag: 'div', props: { innerHTML: '<i>r</i>', key: 1 }, children: [] })
  })

  test('Preact: class kept, boolean attributes, varargs children', () => {
    const [input] = toElements([h('input', { type: 'checkbox', checked: '', disabled: '' })], record, 'preact') as Call[]
    assert.deepEqual(input, { tag: 'input', props: { key: 0, type: 'checkbox', checked: true, disabled: true }, children: [] })
    const [p] = toElements([h('p', { class: 'x' }, 'a', 'b')], record, 'preact') as Call[]
    assert.deepEqual(p.children, ['a', 'b'])
    assert.equal(p.props?.class, 'x')
  })
})
