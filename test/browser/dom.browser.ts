// DOM-path tests in real Chromium: what Node cannot check.
//   npm run test:browser   (needs `npx playwright install chromium` once)
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Browser } from 'playwright'
import { launch, openPage, readRepoFile } from './harness.ts'

type Lib = typeof import('../../src/index.ts') & typeof import('../../src/gfm/index.ts')
declare global {
  interface Window {
    mdlib: Lib
    pwned?: number
  }
}

const spec: Array<{ markdown: string; html: string; example: number }> = JSON.parse(readRepoFile('test/fixtures/commonmark-0.31.2.json'))
const gfmExamples: Array<{ markdown: string }> = JSON.parse(readRepoFile('test/fixtures/gfm.json'))

let browser: Browser
before(async () => {
  browser = await launch()
})
after(() => browser.close())

describe('in the browser', () => {
  test('CommonMark spec passes with the default (DOM) entity decoder', async () => {
    const page = await openPage(browser)
    const failures = await page.evaluate((examples) => {
      const md = window.mdlib.createMarkdown({ html: true, allowUrl: () => true })
      return examples.filter((ex) => md.render(ex.markdown) !== ex.html).map((ex) => ex.example)
    }, spec)
    assert.deepEqual(failures, [])
  })

  test('renderTo builds the same DOM as render() (CommonMark + GFM corpus)', async () => {
    const page = await openPage(browser)
    const corpus = [...spec.map((e) => e.markdown), ...gfmExamples.map((e) => e.markdown)]
    const mismatches = await page.evaluate((sources) => {
      const { createMarkdown, gfm } = window.mdlib
      const md = createMarkdown({ plugins: gfm() })
      const a = document.createElement('div')
      const b = document.createElement('div')
      // The string serializer adds cosmetic newlines around block tags and after
      // <br>; DOM building does not. They are whitespace text nodes only.
      const norm = (el: HTMLElement) => el.innerHTML.replace(/\n+(?=<)|(?<=>)\n+/g, '').trim()
      const bad: string[] = []
      for (const src of sources) {
        md.renderTo(a, src)
        b.innerHTML = md.render(src) // trusted test fixtures
        if (norm(a) !== norm(b)) bad.push(src)
      }
      return bad
    }, corpus)
    assert.deepEqual(mismatches, [])
  })

  test('renderTo never assigns innerHTML when there is no raw HTML', async () => {
    const page = await openPage(browser)
    const writes = await page.evaluate(() => {
      const proto = Element.prototype
      const desc = Object.getOwnPropertyDescriptor(proto, 'innerHTML')!
      const seen: string[] = []
      Object.defineProperty(proto, 'innerHTML', {
        ...desc,
        set(v: string) {
          // The entity decoder's <textarea> is the one allowed (RCDATA) use.
          if (this.tagName !== 'TEXTAREA') seen.push(this.tagName)
          desc.set!.call(this, v)
        },
      })
      const md = window.mdlib.createMarkdown({ plugins: window.mdlib.gfm() })
      md.renderTo(document.querySelector('#out')!, '# T &copy;\n\n*a* [b](/c) `d` <e>\n\n| x |\n|---|\n| y |\n\n- [ ] z[^1]\n\n[^1]: n')
      Object.defineProperty(proto, 'innerHTML', desc)
      return seen
    })
    assert.deepEqual(writes, [])
  })

  test('default options: hostile markdown cannot run script', async () => {
    const page = await openPage(browser)
    const result = await page.evaluate(async () => {
      const out = document.querySelector('#out')!
      window.mdlib.createMarkdown().renderTo(
        out,
        '<img src=x onerror="window.pwned=1">\n\n[a](javascript:window.pwned=1) ![b](javascript:x)\n\n<svg onload="window.pwned=1">',
      )
      await new Promise((r) => setTimeout(r, 50)) // let any image error handler fire
      const all = [...out.querySelectorAll('*')]
      return {
        pwned: window.pwned,
        handlers: all.filter((el) => [...el.attributes].some((a) => a.name.startsWith('on'))).length,
        svg: out.querySelectorAll('svg').length,
        urls: all.map((el) => el.getAttribute('href') ?? el.getAttribute('src')).filter((u) => u !== null),
      }
    })
    assert.deepEqual(result, { pwned: undefined, handlers: 0, svg: 0, urls: ['', ''] })
  })

  test('html: true goes through sanitize before reaching the DOM', async () => {
    const page = await openPage(browser)
    const result = await page.evaluate(async () => {
      const out = document.querySelector('#out')!
      const sanitize = (html: string) => html.replace(/\son\w+="[^"]*"/g, '')
      window.mdlib.createMarkdown({ html: true, sanitize }).renderTo(out, '<img src="x" onerror="window.pwned=1"> *ok*')
      await new Promise((r) => setTimeout(r, 50))
      return { pwned: window.pwned, html: out.innerHTML }
    })
    assert.equal(result.pwned, undefined)
    assert.equal(result.html, '<p><img src="x"> <em>ok</em></p>\n')
  })
})

describe('theme.css in the browser', () => {
  const css = readRepoFile('styles/theme.css')
  const sample = '# Title\n\n[link](/x)\n\n> [!TIP]\n> last\n\n- [ ] task'

  test('edge resets win over element margins (source order)', async () => {
    const page = await openPage(browser, { css })
    const m = await page.evaluate((src) => {
      const out = document.querySelector('#out')!
      window.mdlib.createMarkdown({ plugins: window.mdlib.gfm() }).renderTo(out, src)
      const style = (sel: string) => getComputedStyle(out.querySelector(sel)!)
      return { h1Top: style('h1').marginTop, alertLast: style('.markdown-alert > :last-child').marginBottom }
    }, sample)
    assert.deepEqual(m, { h1Top: '0px', alertLast: '0px' })
  })

  test('hues follow color-scheme', async () => {
    const color = async (scheme: 'light' | 'dark') => {
      const page = await openPage(browser, { css: css + ':root{color-scheme:light dark}', scheme })
      return page.evaluate((src) => {
        const out = document.querySelector('#out')!
        window.mdlib.createMarkdown().renderTo(out, src)
        return getComputedStyle(out.querySelector('a')!).color
      }, '[x](/y)')
    }
    assert.equal(await color('light'), 'rgb(9, 105, 218)')
    assert.equal(await color('dark'), 'rgb(68, 147, 248)')
  })

  test('any unlayered rule overrides the theme (zero specificity + layer)', async () => {
    const page = await openPage(browser, { css: css + 'a { color: rgb(1, 2, 3) } h1 { margin-top: 7px }' })
    const r = await page.evaluate(() => {
      const out = document.querySelector('#out')!
      window.mdlib.createMarkdown().renderTo(out, '# T\n\n[x](/y)')
      return [getComputedStyle(out.querySelector('a')!).color, getComputedStyle(out.querySelector('h1')!).marginTop]
    })
    assert.deepEqual(r, ['rgb(1, 2, 3)', '7px'])
  })
})
