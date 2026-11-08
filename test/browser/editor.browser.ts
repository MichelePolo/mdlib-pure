import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import type { Browser, Page } from 'playwright'
import { launch } from './harness.ts'

let browser: Browser
before(() => {
  execFileSync('npm', ['run', 'site:build'], { stdio: 'pipe' })
})
before(async () => { browser = await launch() })
after(() => browser?.close())
async function open(width = 1440): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 1000 }, serviceWorkers: 'block' })
  await page.route('http://editor.test/**', route => {
    const path = new URL(route.request().url()).pathname
    const file = resolve('site/out', '.' + (path.endsWith('/') ? path + 'index.html' : path))
    const types: Record<string, string> = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2' }
    try { return route.fulfill({ contentType: types[extname(file)] ?? 'application/octet-stream', body: readFileSync(file) }) }
    catch { return route.fulfill({ status:404, body:'Missing' }) }
  })
  await page.goto('http://editor.test/playground/')
  await page.waitForFunction(() => (document.querySelector('#pg-count')?.textContent?.length ?? 0) > 0)
  return page
}

test('editor modes, selected text, plugins, undo, draft, theme and mobile', { timeout: 60000 }, async () => {
  const page = await open()
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.locator('#panel-preview .katex').first().waitFor()
    await page.waitForFunction(() => (document.querySelector('#panel-preview') as HTMLElement)?.dataset.diagramsReady === 'true')
    await page.screenshot({ path:'/tmp/mdlib-editor-showcase.png', fullPage:true })
    assert.equal(await page.locator('main').getAttribute('data-mode'), 'split')
    await page.locator('#src').fill('Hello')
    await page.locator('#src').selectText()
    await page.getByRole('button', { name: 'Grassetto (Ctrl+B)', exact:true }).click()
    assert.equal(await page.locator('#src').inputValue(), '**Hello**')
    await page.locator('#pg-undo').click()
    assert.equal(await page.locator('#src').inputValue(), 'Hello')
    await page.locator('#pg-redo').click()
    assert.equal(await page.locator('#src').inputValue(), '**Hello**')
    await page.getByRole('button', { name:'Leggi', exact:true }).click()
    assert.equal(await page.locator('#src').isVisible(), false)
    assert.equal(await page.locator('#panel-preview strong').textContent(), 'Hello')
    await page.getByRole('button', { name:'Scrivi', exact:true }).click()
    assert.equal(await page.locator('.pg-right').isVisible(), false)
    await page.getByRole('button', { name:'Split', exact:true }).click()
    await page.locator('#src').fill('')
    await page.locator('[data-command="math"]').click()
    await page.locator('#panel-preview .katex').waitFor()
    await page.locator('#src').fill('')
    await page.locator('[data-command="mermaid"]').click()
    await page.locator('#panel-preview svg').waitFor()
    await page.locator('#scheme').selectOption('dark')
    assert.equal(await page.locator('meta[name="color-scheme"]').getAttribute('content'), 'dark')
    await page.screenshot({ path:'/tmp/mdlib-editor-dark.png', fullPage:true })
    await page.locator('#scheme').selectOption('light')
    await page.screenshot({ path:'/tmp/mdlib-editor-light.png', fullPage:true })
    await page.setViewportSize({ width:390, height:844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path:'/tmp/mdlib-editor-mobile.png', fullPage:true })
    await page.locator('#src').fill('# Saved draft')
    await page.waitForFunction(() => localStorage.getItem('mdlib-pure:playground')?.includes('Saved draft'))
    await page.reload()
    await page.waitForFunction(() => (document.querySelector('#src') as HTMLTextAreaElement)?.value === '# Saved draft')
    assert.deepEqual(errors, [])
  } finally { await page.close() }
})

test('MD and HTML downloads preserve content; PDF has a safe print document', { timeout: 60000 }, async () => {
  const page = await open()
  try {
    await page.locator('#src').fill('# Export test\n\n**Bold**\n\n<script>window.pwned=1</script>\n\n[bad](javascript:alert(1))')
    await page.locator('#pg-name').fill('Demo')
    for (const format of ['md','html']) {
      const pending = page.waitForEvent('download')
      await page.locator(`[data-export="${format}"]`).click()
      const download = await pending
      assert.equal(download.suggestedFilename(), `Demo.${format}`)
      const path = await download.path()
      const text = readFileSync(path!, 'utf8')
      if (format === 'md') assert.match(text, /\*\*Bold\*\*/)
      else {
        assert.match(text, /<strong>Bold<\/strong>/)
        assert.doesNotMatch(text, /<script>|href="javascript:/)
        assert.match(text, /<title>Demo<\/title>/)
      }
    }
    await page.locator('[data-export="pdf"]').click()
    await page.locator('.editor-print-frame').waitFor({ state:'attached' })
    await page.waitForFunction(() => document.querySelector('#pg-status')?.textContent?.includes('Salva come PDF'))
    const frame = await page.locator('.editor-print-frame').contentFrame()
    assert.match(await frame.locator('h1').textContent() ?? '', /^Export test(?: #)?$/)
    assert.equal(await page.locator('.editor-print-frame').getAttribute('sandbox'), 'allow-same-origin allow-modals')
  } finally { await page.close() }
})

for (const width of [1440, 390]) {
  test(`Split synchronizes vertical scrolling in both directions at ${width}px`, { timeout: 60000 }, async () => {
    const page = await open(width)
    try {
      await page.locator('#src').fill(Array.from({ length: 60 }, (_, i) => `## Section ${i}\n\nA **paragraph** with text.\n\n- First\n- Second\n`).join('\n'))
      await page.waitForFunction(() => document.querySelectorAll('#panel-preview h2').length === 60)
      async function scrollAndCheck(selector: string, ratio: number, output = '#panel-preview') {
        await page.locator(selector).evaluate((el, ratio) => { el.scrollTop = ratio * (el.scrollHeight - el.clientHeight) }, ratio)
        await page.waitForFunction(({ ratio, output }) => ['#src', output].every(selector => {
          const el = document.querySelector(selector) as HTMLElement
          const range = el.scrollHeight - el.clientHeight
          return range > 0 && Math.abs(el.scrollTop / range - ratio) < .005
        }), { ratio, output })
        // Check that the counterpart's scroll event does not feed back and drift.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const values = await page.locator('#src').evaluate(el => ({ top: el.scrollTop, range: el.scrollHeight - el.clientHeight }))
        assert.ok(Math.abs(values.top / values.range - ratio) < .005)
      }
      await scrollAndCheck('#src', .5)
      await scrollAndCheck('#panel-preview', .8)
      await scrollAndCheck('#src', 1)
      await scrollAndCheck('#panel-preview', 0)
      await page.getByRole('tab', { name:'HTML', exact:true }).click()
      await scrollAndCheck('#panel-html', .4, '#panel-html')
      await page.getByRole('button', { name:'Leggi', exact:true }).click()
      const before = await page.locator('#src').evaluate(el => el.scrollTop)
      await page.locator('#panel-preview').evaluate(el => { el.scrollTop = el.scrollHeight })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.equal(await page.locator('#src').evaluate(el => el.scrollTop), before)
      await page.getByRole('button', { name:'Split', exact:true }).click()
      await scrollAndCheck('#src', .25)
      await page.locator('#src').fill('Short document')
      await page.waitForFunction(() => document.querySelector('#panel-preview')?.textContent?.includes('Short document'))
      assert.equal(await page.locator('#panel-preview').evaluate(el => el.scrollTop), 0)
    } finally { await page.close() }
  })
}
