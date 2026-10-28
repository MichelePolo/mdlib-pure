// DOM-path tests in real Chromium: what Node cannot check.
//   npm run test:browser   (needs `npx playwright install chromium` once)
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Browser } from 'playwright'
import { launch, mermaidBundle, openPage, readRepoFile } from './harness.ts'

type Lib = typeof import('../../src/index.ts') &
  typeof import('../../src/gfm/index.ts') &
  typeof import('../../src/plugins/math.ts') &
  typeof import('../../src/plugins/mermaid.ts')
declare global {
  interface Window {
    mdlib: Lib
    pwned?: number
    renderMathInElement?: (el: Element) => void
    __mermaid?: import('../../src/plugins/mermaid.ts').MermaidLike
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

describe('Tailwind CSS v4 integration (real build)', () => {
  let css = ''
  before(async () => {
    const { execFileSync } = await import('node:child_process')
    const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(`${tmpdir()}/mdlib-tw-`)
    execFileSync('npx', ['@tailwindcss/cli', '-i', 'test/browser/tailwind/input.css', '-o', `${dir}/out.css`], { stdio: 'ignore' })
    css = readFileSync(`${dir}/out.css`, 'utf8')
    rmSync(dir, { recursive: true })
  })

  const probe = (css: string) => async () => {
    const page = await openPage(browser, { css })
    return page.evaluate(() => {
      const out = document.querySelector('#out')!
      window.mdlib.createMarkdown().renderTo(out, '# Title\n\nText [plain](/a) and [red](/b).\n\n- item')
      out.querySelectorAll('a')[1].className = 'text-red-500'
      const probe = document.createElement('p')
      probe.className = 'text-md-link rounded-md mt-9'
      document.body.append(probe)
      const red = document.createElement('span')
      red.className = 'text-red-500'
      document.body.append(red)
      const cs = (el: Element) => getComputedStyle(el)
      const [plain, styled] = out.querySelectorAll('a')
      return {
        utilityBeatsTheme: cs(styled).color === cs(red).color && cs(styled).color !== cs(plain).color,
        themeLinkColor: cs(plain).color,
        tokenUtility: cs(probe).color,
        roundedMdUntouched: cs(probe).borderTopLeftRadius,
        preflightRestoredByTheme: { h1Size: cs(out.querySelector('h1')!).fontSize, ulPadding: cs(out.querySelector('ul')!).paddingInlineStart },
        mappedHeading: cs(out.querySelector('h1')!).color,
      }
    })
  }

  test('utilities win, tokens become utilities, mapping works, preflight does not break the theme', async () => {
    const r = await probe(css)()
    assert.equal(r.utilityBeatsTheme, true)
    assert.equal(r.themeLinkColor, 'rgb(9, 105, 218)')
    assert.equal(r.tokenUtility, 'rgb(9, 105, 218)') // text-md-link follows --md-color-link
    assert.equal(r.roundedMdUntouched, '6px') // Tailwind's own rounded-md (0.375rem), not shadowed
    assert.deepEqual(r.preflightRestoredByTheme, { h1Size: '32px', ulPadding: '28px' })
    assert.equal(r.mappedHeading, 'rgb(10, 20, 30)') // --md-color-heading: var(--color-primary)
  })
})

describe('math plugin with KaTeX auto-render (no configuration)', () => {
  test('default output is found and typeset by renderMathInElement', async () => {
    const page = await openPage(browser)
    await page.addScriptTag({ content: readRepoFile('node_modules/katex/dist/katex.min.js') })
    await page.addScriptTag({ content: readRepoFile('node_modules/katex/dist/contrib/auto-render.min.js') })
    const r = await page.evaluate(() => {
      const out = document.querySelector('#out')!
      window.mdlib.createMarkdown({ plugins: [window.mdlib.math()] }).renderTo(out, 'Euler: $e^{i\\pi}+1=0$ and $$\\sum_k a_k$$\n\n$$\n\\int_0^1 x\\,dx\n$$')
      window.renderMathInElement!(out)
      return {
        katex: out.querySelectorAll('.math .katex').length, // auto-render wraps each formula in a span
        display: out.querySelectorAll('.math-display .katex-display').length,
        errors: out.querySelectorAll('.katex-error').length,
        leftover: /\\[([]/.test(out.textContent ?? ''),
      }
    })
    assert.deepEqual(r, { katex: 3, display: 2, errors: 0, leftover: false })
  })
})

describe('mermaid plugin with real Mermaid 12', () => {
  const css = readRepoFile('styles/theme.css') + ':root { color-scheme: light dark }'
  const setup = async () => {
    const page = await openPage(browser, { css })
    await page.addScriptTag({ content: await mermaidBundle() })
    return page
  }

  test('no diagrams: Mermaid is never loaded', async () => {
    const page = await setup()
    const loaded = await page.evaluate(async () => {
      const out = document.querySelector('#out')!
      window.mdlib.createMarkdown({ plugins: [window.mdlib.mermaid()] }).renderTo(out, '# No diagrams\n\n```js\nx\n```')
      let called = false
      await window.mdlib.renderMermaid(out, { load: async () => ((called = true), window.__mermaid!) })
      return called
    })
    assert.equal(loaded, false)
  })

  test('valid diagrams become SVG, invalid ones keep their source, strict mode blocks script', async () => {
    const page = await setup()
    const r = await page.evaluate(async () => {
      const out = document.querySelector('#out')!
      const src = [
        '```mermaid\ngraph TD\n  A-->B\n```',
        '```mermaid\nthis is not a diagram\n```',
        '```mermaid\ngraph TD\n  X["<img src=x onerror=window.pwned=1>"]\n  click X call pwn()\n```',
      ].join('\n\n')
      window.mdlib.createMarkdown({ plugins: [window.mdlib.mermaid()] }).renderTo(out, src)
      await window.mdlib.renderMermaid(out, { load: async () => window.__mermaid!, watch: false })
      await new Promise((res) => setTimeout(res, 100))
      return {
        svgs: out.querySelectorAll('pre.mermaid svg').length,
        errors: out.querySelectorAll('pre.mermaid-error').length,
        errorSource: out.querySelector('pre.mermaid-error')?.textContent,
        pwned: window.pwned,
        handlers: [...out.querySelectorAll('*')].filter((el) => [...el.attributes].some((a) => a.name.startsWith('on'))).length,
      }
    })
    assert.deepEqual(r, { svgs: 2, errors: 1, errorSource: 'this is not a diagram\n', pwned: undefined, handlers: 0 })
  })

  test('theme from tokens, redrawn when the color scheme changes; the returned function stops watching', async () => {
    const page = await setup()
    const r = await page.evaluate(async () => {
      const out = document.querySelector('#out')!
      window.mdlib.createMarkdown({ plugins: [window.mdlib.mermaid()] }).renderTo(out, '```mermaid\ngraph TD\n  A-->B\n```')
      const stop = await window.mdlib.renderMermaid(out, { load: async () => window.__mermaid! })
      const svg = () => out.querySelector('pre.mermaid svg')?.outerHTML ?? ''
      const light = svg()
      const until = async (ok: () => boolean) => {
        for (let i = 0; i < 60 && !ok(); i++) await new Promise((res) => setTimeout(res, 50))
        return ok()
      }
      document.documentElement.style.colorScheme = 'dark'
      const dark = await until(() => svg().includes('#4493f8'))
      stop()
      document.documentElement.style.colorScheme = 'light'
      await new Promise((res) => setTimeout(res, 300))
      return { light: light.includes('#0969da'), dark, stillDark: svg().includes('#4493f8') }
    })
    assert.deepEqual(r, { light: true, dark: true, stillDark: true })
  })

  test('also redraws when <meta name="color-scheme"> changes (how many sites switch themes)', async () => {
    const page = await setup()
    const dark = await page.evaluate(async () => {
      document.querySelector('style')!.textContent += ':root { color-scheme: normal }'
      const meta = Object.assign(document.createElement('meta'), { name: 'color-scheme', content: 'light' })
      document.head.append(meta)
      const out = document.querySelector('#out')!
      window.mdlib.createMarkdown({ plugins: [window.mdlib.mermaid()] }).renderTo(out, '```mermaid\ngraph TD\n  A-->B\n```')
      const stop = await window.mdlib.renderMermaid(out, { load: async () => window.__mermaid! })
      const svg = () => out.querySelector('pre.mermaid svg')?.outerHTML ?? ''
      meta.content = 'dark'
      for (let i = 0; i < 60 && !svg().includes('#4493f8'); i++) await new Promise((res) => setTimeout(res, 50))
      stop()
      return svg().includes('#4493f8')
    })
    assert.equal(dark, true)
  })
})
