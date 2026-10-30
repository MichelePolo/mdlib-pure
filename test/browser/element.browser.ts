// <mdlib-markdown> and <mdlib-editor> in real Chromium.
import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { Browser, Page } from 'playwright'
import type { ElementsOptions } from '../../src/element.ts'
import { launch, mermaidBundle, openPage, reactBundle, readRepoFile } from './harness.ts'

let browser: Browser
before(async () => {
  browser = await launch()
})
after(() => browser.close())

const css = readRepoFile('styles/theme.css') + readRepoFile('styles/editor.css')

/** A page with the elements defined, KaTeX and Mermaid available through loaders. */
async function setup(): Promise<Page> {
  const page = await openPage(browser, { css })
  await page.addScriptTag({ content: readRepoFile('node_modules/katex/dist/katex.min.js') })
  await page.addScriptTag({ content: readRepoFile('node_modules/katex/dist/contrib/auto-render.min.js') })
  await page.addScriptTag({ content: await mermaidBundle() })
  await page.evaluate(() => {
    const w = window as any
    w.mdlib.defineElements({
      loaders: { mermaid: async () => w.__mermaid, katex: async () => w.renderMathInElement },
      configs: { shout: { highlight: (code: string) => code.toUpperCase() } },
    })
  })
  return page
}

// The loaders of docs/elements.md type-check against the libraries' own
// types (npm run typecheck); never called here.
export const documentedLoaders: ElementsOptions['loaders'] = {
  mermaid: () => import('mermaid'),
  katex: () => import('katex/contrib/auto-render').then((m) => m.default),
}

const until = `async (ok) => { for (let i = 0; i < 80 && !ok(); i++) await new Promise((r) => setTimeout(r, 50)); return ok() }`

describe('<mdlib-markdown>', () => {
  test('renders the source attribute and re-renders when it changes', async () => {
    const page = await setup()
    const html = await page.evaluate(() => {
      const el = document.createElement('mdlib-markdown')
      el.setAttribute('source', '# Hi *there*')
      document.body.append(el)
      const first = el.innerHTML
      el.setAttribute('source', '~~old~~')
      const plain = el.innerHTML
      el.setAttribute('plugins', 'gfm')
      return [first, plain, el.innerHTML]
    })
    assert.deepEqual(html, ['<h1>Hi <em>there</em></h1>', '<p>~~old~~</p>', '<p><del>old</del></p>'])
  })

  test('functions come from named configs; raw HTML cannot be enabled from attributes', async () => {
    const page = await setup()
    const r = await page.evaluate(() => {
      const el = document.createElement('mdlib-markdown')
      el.setAttribute('config', 'shout')
      el.setAttribute('html', 'true')
      el.setAttribute('source', '```js\nlet x\n```\n\n<img src=x onerror=alert(1)> [a](javascript:x)')
      document.body.append(el)
      return { code: el.querySelector('code')!.textContent, img: el.querySelectorAll('img').length, href: el.querySelector('a')!.getAttribute('href') }
    })
    assert.deepEqual(r, { code: 'LET X\n', img: 0, href: '' })
  })

  test('plugins="all": math typeset by KaTeX, diagrams drawn by Mermaid, loaded on demand', async () => {
    const page = await setup()
    const r = await page.evaluate(async (untilSrc) => {
      const wait = eval(untilSrc)
      const el = document.createElement('mdlib-markdown')
      el.className = 'md'
      el.setAttribute('plugins', 'all')
      el.setAttribute('source', '# T\n\n$x^2$ and ==mark==\n\n```mermaid\ngraph TD\n  A-->B\n```')
      document.body.append(el)
      await wait(() => el.querySelector('.katex') && el.querySelector('pre.mermaid svg'))
      return { katex: el.querySelectorAll('.katex').length, svg: el.querySelectorAll('svg').length, mark: el.querySelectorAll('mark').length, id: el.querySelector('h1')!.id }
    }, until)
    assert.deepEqual(r, { katex: 1, svg: 1, mark: 1, id: 't' })
  })
})

describe('<mdlib-editor>', () => {
  test('typing updates the preview at once; input is debounced, change on blur', async () => {
    const page = await setup()
    await page.evaluate(() => {
      const ed = document.createElement('mdlib-editor')
      ed.setAttribute('value', '# Start')
      ed.setAttribute('plugins', 'gfm')
      ed.setAttribute('delay', '150')
      ;(window as any).events = []
      for (const t of ['input', 'change']) ed.addEventListener(t, (e) => (window as any).events.push([t, (e.target as any).value]))
      document.body.append(ed)
    })
    await page.locator('mdlib-editor textarea').click()
    await page.keyboard.press('End')
    await page.keyboard.type(' and *more*')
    const preview = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(document.querySelector('.mdlib-editor-preview')!.innerHTML))))
    const before = await page.evaluate(() => (window as any).events.length)
    await page.waitForTimeout(400)
    const afterDelay = await page.evaluate(() => (window as any).events)
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    const afterBlur = await page.evaluate(() => (window as any).events)
    assert.equal(preview, '<h1>Start and <em>more</em></h1>')
    assert.equal(before, 0, 'no input event while typing fast')
    assert.deepEqual(afterDelay, [['input', '# Start and *more*']])
    assert.deepEqual(afterBlur.at(-1), ['change', '# Start and *more*'])
  })

  test('the value property set before connection is kept (frameworks set properties first)', async () => {
    const page = await setup()
    const r = await page.evaluate(() => {
      const state = (ed: any) => ({ value: ed.value, text: ed.querySelector('textarea').value, preview: ed.querySelector('.mdlib-editor-preview').innerHTML })
      const prop = document.createElement('mdlib-editor') as any
      prop.value = '# Property'
      document.body.append(prop)
      // Attribute first, then the property: the later one wins, as for a set after connection.
      const both = document.createElement('mdlib-editor') as any
      both.setAttribute('value', '# Attribute')
      both.value = '# Both'
      document.body.append(both)
      const attr = document.createElement('mdlib-editor')
      attr.setAttribute('value', '# Attribute')
      document.body.append(attr)
      return { prop: state(prop), both: state(both), attr: state(attr), form: (() => { const f = document.createElement('form'); const ed = document.createElement('mdlib-editor') as any; ed.setAttribute('name', 'b'); ed.value = 'x'; f.append(ed); document.body.append(f); return new FormData(f).get('b') })() }
    })
    assert.deepEqual(r.prop, { value: '# Property', text: '# Property', preview: '<h1>Property</h1>' })
    assert.deepEqual(r.both, { value: '# Both', text: '# Both', preview: '<h1>Both</h1>' })
    assert.deepEqual(r.attr, { value: '# Attribute', text: '# Attribute', preview: '<h1>Attribute</h1>' })
    assert.equal(r.form, 'x')
  })

  test('a value property set before defineElements() survives the upgrade', async () => {
    const page = await openPage(browser, { css })
    const r = await page.evaluate(() => {
      const ed = document.createElement('mdlib-editor') as any
      ed.value = '# Early' // a plain own property: the class does not exist yet
      document.body.append(ed)
      ;(window as any).mdlib.defineElements()
      return { own: Object.hasOwn(ed, 'value'), value: ed.value, preview: ed.querySelector('.mdlib-editor-preview').innerHTML }
    })
    assert.deepEqual(r, { own: false, value: '# Early', preview: '<h1>Early</h1>' })
  })

  test('React 19: <mdlib-editor value={…}> renders the value and follows re-renders', async () => {
    const page = await setup()
    await page.addScriptTag({ content: await reactBundle() })
    const r = await page.evaluate(() => {
      const { createElement, createRoot, flushSync } = (window as any).__react
      const host = document.createElement('div')
      document.body.append(host)
      const root = createRoot(host)
      const ed = () => host.querySelector('mdlib-editor') as any
      const state = () => ({ value: ed().value, preview: ed().querySelector('.mdlib-editor-preview').innerHTML })
      flushSync(() => root.render(createElement('mdlib-editor', { value: '# From React', plugins: 'gfm' })))
      const first = state()
      const w = window as any
      w.received = []
      flushSync(() => root.render(createElement('mdlib-editor', { value: '# Again', plugins: 'gfm', delay: '50', onInput: (e: any) => w.received.push(e.target.value) })))
      return { first, second: state(), attribute: ed().getAttribute('value') }
    })
    // React 19 sets `value` as a property (the element has a setter), never as an attribute.
    assert.deepEqual(r, { first: { value: '# From React', preview: '<h1>From React</h1>' }, second: { value: '# Again', preview: '<h1>Again</h1>' }, attribute: null })
    // onInput gets the element's debounced `input` event, not every keystroke.
    await page.locator('mdlib-editor textarea').click()
    await page.keyboard.press('End')
    await page.keyboard.type('!')
    await page.waitForTimeout(200)
    assert.deepEqual(await page.evaluate(() => (window as any).received), ['# Again!'])
  })

  test('test DOMs without ElementInternals form support (jsdom): no errors', async () => {
    const page = await openPage(browser, { css })
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const r = await page.evaluate(() => {
      // jsdom 29 has attachInternals() but no setFormValue(); older versions have neither.
      delete (ElementInternals.prototype as any).setFormValue
      ;(window as any).mdlib.defineElements()
      const ed = document.createElement('mdlib-editor') as any
      ed.value = '# One'
      document.body.append(ed)
      ed.value = '# Two'
      delete (HTMLElement.prototype as any).attachInternals
      const old = document.createElement('mdlib-editor') as any
      old.setAttribute('value', '# Three')
      document.body.append(old)
      return [ed.value, old.value]
    })
    await page.locator('mdlib-editor textarea').first().fill('# Typed')
    await page.waitForTimeout(300)
    assert.deepEqual(r, ['# Two', '# Three'])
    assert.deepEqual(errors, [])
  })

  test('a stale echo while typing is ignored; a deliberate set is applied', async () => {
    const page = await setup()
    await page.evaluate(() => {
      const ed = document.createElement('mdlib-editor')
      ed.setAttribute('delay', '0')
      document.body.append(ed)
    })
    const ta = page.locator('mdlib-editor textarea')
    await ta.click()
    await page.keyboard.type('ab')
    await page.waitForTimeout(50) // 'ab' is sent to listeners
    await page.keyboard.type('c')
    // A server re-rendering late sends back the older value while the user types.
    await page.evaluate(() => document.querySelector('mdlib-editor')!.setAttribute('value', 'ab'))
    const kept = await ta.inputValue()
    // A Reset button: focus leaves the textarea, then the value is set.
    await page.locator('body').click({ position: { x: 1, y: 1 } })
    await page.evaluate(() => document.querySelector('mdlib-editor')!.setAttribute('value', ''))
    assert.equal(kept, 'abc')
    assert.equal(await ta.inputValue(), '')
    assert.equal(await page.locator('.mdlib-editor-preview').innerHTML(), '')
  })

  test('toolbar and shortcuts, views, form value', async () => {
    const page = await setup()
    await page.evaluate(() => {
      const form = document.createElement('form')
      const ed = document.createElement('mdlib-editor')
      ed.setAttribute('name', 'body')
      ed.setAttribute('value', 'word')
      form.append(ed)
      document.body.append(form)
    })
    const ta = page.locator('mdlib-editor textarea')
    await ta.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Control+B')
    await page.getByRole('button', { name: 'Italic (Ctrl+I)' }).click()
    await page.getByRole('button', { name: 'Preview view' }).click()
    const r = await page.evaluate(() => ({
      value: (document.querySelector('mdlib-editor') as any).value,
      preview: document.querySelector('.mdlib-editor-preview')!.innerHTML,
      view: document.querySelector('mdlib-editor')!.getAttribute('view'),
      inputHidden: getComputedStyle(document.querySelector('mdlib-editor textarea')!).display === 'none',
      pressed: document.querySelector('[data-view="preview"]')!.getAttribute('aria-pressed'),
      form: new FormData(document.querySelector('form')!).get('body'),
    }))
    assert.deepEqual(r, { value: '**_word_**', preview: '<p><strong><em>word</em></strong></p>', view: 'preview', inputHidden: true, pressed: 'true', form: '**_word_**' })
  })

  test('disabled by a <fieldset> or its own attribute: no typing, no formatting, no form value', async () => {
    const page = await setup()
    await page.evaluate(() => {
      document.body.innerHTML = '<form><fieldset disabled><mdlib-editor name="body" value="kept"></mdlib-editor></fieldset></form>' // check:allow-innerHTML test fixture
    })
    const state = () =>
      page.evaluate(() => {
        const ed = document.querySelector('mdlib-editor')!
        return {
          matches: ed.matches(':disabled'),
          input: ed.querySelector('textarea')!.disabled,
          bold: ed.querySelector<HTMLButtonElement>('button:not([data-view])')!.disabled,
          view: ed.querySelector<HTMLButtonElement>('[data-view]')!.disabled,
          form: new FormData(document.querySelector('form')!).get('body'),
          value: (ed as any).value,
        }
      })
    assert.deepEqual(await state(), { matches: true, input: true, bold: true, view: false, form: null, value: 'kept' })
    // Disabled text areas take no clicks or keys.
    await page.locator('mdlib-editor textarea').click({ force: true })
    await page.keyboard.type('typed')
    assert.equal(await page.evaluate(() => (document.querySelector('mdlib-editor') as any).value), 'kept')

    await page.evaluate(() => document.querySelector('fieldset')!.removeAttribute('disabled'))
    assert.deepEqual(await state(), { matches: false, input: false, bold: false, view: false, form: 'kept', value: 'kept' })

    await page.evaluate(() => document.querySelector('mdlib-editor')!.setAttribute('disabled', ''))
    assert.deepEqual(await state(), { matches: true, input: true, bold: true, view: false, form: null, value: 'kept' })
  })

  test('diagrams already drawn do not flicker while typing elsewhere', async () => {
    const page = await setup()
    await page.evaluate(() => {
      const ed = document.createElement('mdlib-editor')
      ed.setAttribute('plugins', 'all')
      ed.setAttribute('value', '```mermaid\ngraph TD\n  A-->B\n```\n\nText')
      document.body.append(ed)
    })
    await page.waitForFunction(() => document.querySelector('.mdlib-editor-preview svg'))
    await page.locator('mdlib-editor textarea').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('!')
    const svgNextFrame = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(!!document.querySelector('.mdlib-editor-preview svg'))))))
    assert.equal(svgNextFrame, true)
  })
})

describe('robust against frameworks that morph the page', () => {
  test('emptied from outside: the viewer renders again, the editor restores its parts and keeps the text', async () => {
    const page = await setup()
    await page.evaluate(() => {
      const v = document.createElement('mdlib-markdown')
      v.id = 'v'
      v.setAttribute('source', '# Kept')
      const ed = document.createElement('mdlib-editor')
      ed.setAttribute('value', 'typed text')
      document.body.append(v, ed)
    })
    const r = await page.evaluate(async () => {
      document.querySelector('#v')!.replaceChildren() // what an enhanced update does
      document.querySelector('mdlib-editor')!.replaceChildren()
      await new Promise((res) => setTimeout(res, 50))
      return {
        viewer: document.querySelector('#v')!.innerHTML,
        toolbar: !!document.querySelector('mdlib-editor > .mdlib-editor-toolbar'),
        text: (document.querySelector('mdlib-editor textarea') as HTMLTextAreaElement).value,
      }
    })
    assert.deepEqual(r, { viewer: '<h1>Kept</h1>', toolbar: true, text: 'typed text' })
  })

  test('the KaTeX stylesheet is adopted, so removing <link>s from the document cannot drop it', async () => {
    const page = await setup()
    const r = await page.evaluate(async (untilSrc) => {
      const wait = eval(untilSrc)
      ;(window as any).mdlib.defineElements({ loaders: { katexStylesheet: 'data:text/css,.katex-probe{color:rgb(1,2,3)}' } })
      const el = document.createElement('mdlib-markdown')
      el.setAttribute('plugins', 'math')
      el.setAttribute('source', '$x$')
      document.body.append(el)
      await wait(() => document.adoptedStyleSheets.length > 0)
      for (const link of document.querySelectorAll('link')) link.remove()
      const probe = document.createElement('span')
      probe.className = 'katex-probe'
      document.body.append(probe)
      return { adopted: document.adoptedStyleSheets.length, color: getComputedStyle(probe).color }
    }, until)
    assert.deepEqual(r, { adopted: 1, color: 'rgb(1, 2, 3)' })
  })

  test('loaders registered after the elements: existing elements render again', async () => {
    const page = await openPage(browser, { css })
    await page.addScriptTag({ content: await mermaidBundle() })
    const r = await page.evaluate(async (untilSrc) => {
      const wait = eval(untilSrc)
      const w = window as any
      w.mdlib.defineElements({ configs: { early: {} } }) // an app registering configs first
      const el = document.createElement('mdlib-markdown')
      el.setAttribute('plugins', 'mermaid')
      el.setAttribute('source', '```mermaid\ngraph TD\n  A-->B\n```')
      document.body.append(el)
      const before = el.querySelectorAll('svg').length
      w.mdlib.defineElements({ loaders: { mermaid: async () => w.__mermaid } })
      await wait(() => el.querySelector('svg'))
      return { before, after: el.querySelectorAll('svg').length }
    }, until)
    assert.deepEqual(r, { before: 0, after: 1 })
  })
})
