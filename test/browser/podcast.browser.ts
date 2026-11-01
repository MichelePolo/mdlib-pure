import assert from 'node:assert/strict'
import { after, before, describe, test, type TestContext } from 'node:test'
import { build } from 'esbuild'
import type { Browser, Page } from 'playwright'
import { launch, readRepoFile } from './harness.ts'

const { podcastMarkup } = await import(new URL('../../site/lib/podcast-ui.js', import.meta.url).href)
let browser: Browser
let html: string
before(async () => {
  browser = await launch()
  const bundle = await build({ entryPoints: ['site/client/podcast.js'], bundle: true, format: 'iife', target: 'es2022', write: false })
  html = `<!doctype html><html lang="it"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readRepoFile('styles/theme.css')}\n${readRepoFile('site/assets/site.css')}\n${readRepoFile('site/assets/podcast.css')}</style></head><body><div class="podcast-page">${podcastMarkup()}</div><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
})
after(() => browser?.close())

let studioHtml: string
before(async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import { mountPodcastEditor } from './templates/podcast/editor.js'
        window.events = []
        window.editor = mountPodcastEditor(document.querySelector('.podcast'), {
          value: { source: '# Puntata\\n- [ ] Apertura @Campa [intro](time:04:30) [](time:1:05:00)\\n-[] Ospite #tema(color:green) [Scheda ospite](doc:Scheda ospite.md)\\nRiga libera\\n[x] fatto [ ] da fare' },
          participants: ['Campa', 'Duke'],
          grammar: { durations: 'clock', lineBlocks: true, looseTasks: true, tags: { mentions: 'any', hashtags: true } },
          tagColors: { campa: '#123456' },
          tasks: 'notify', documents: 'host', compact: true, current: 1, runningTimer: { line: 1, index: 1 },
          onChange: (state) => window.events.push(['change', state.source]),
          onTaskToggle: (e) => window.events.push(['task', e]),
          onOpenDocument: (e) => window.events.push(['document', e]),
        })`,
      resolveDir: new URL('../../', import.meta.url).pathname,
      loader: 'js',
    },
    bundle: true, format: 'iife', target: 'es2022', write: false,
  })
  studioHtml = `<!doctype html><html lang="it"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readRepoFile('styles/theme.css')}\n${readRepoFile('site/assets/podcast.css')}</style></head><body><div class="podcast-page">${podcastMarkup()}</div><script>${bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
})

async function openStudio(t: TestContext): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], 'no browser errors') })
  await page.route('http://studio.test/**', (route) => route.fulfill({ contentType: 'text/html', body: studioHtml }))
  await page.goto('http://studio.test/')
  await page.waitForSelector('#podcast-preview .podcast-check')
  return page
}

async function open(t: TestContext, width = 1400, storage = true): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 1100 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], 'no browser errors') })
  await page.route('http://podcast.test/**', (route) => route.fulfill({ contentType: 'text/html', body: html }))
  if (!storage) await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage denied') } })
  await page.goto('http://podcast.test/')
  await page.waitForFunction(() => document.querySelector('#podcast-input') instanceof HTMLTextAreaElement && (document.querySelector('#podcast-input') as HTMLTextAreaElement).value.length > 0)
  return page
}

describe('podcast sample, in Chromium', () => {
  test('starts split with exactly five planned minutes, badges and interactive tasks', async (t) => {
    const page = await open(t)
    assert.equal(await page.locator('#podcast-total').textContent(), '5:00:00')
    assert.equal(await page.locator('#podcast-preview .podcast-time').textContent(), '◷ 5 min')
    assert.equal(await page.locator('#podcast-preview .podcast-check').count(), 3)
    assert.equal(await page.locator('#podcast-preview .podcast-check:disabled').count(), 0)
    assert.equal(await page.locator('#podcast-preview u').textContent(), 'sottolineato')
    assert.equal(await page.locator('#podcast-preview h1').evaluate((el) => getComputedStyle(el).fontSize), '24px')
    assert.equal(await page.locator('#podcast-preview .podcast-check').first().evaluate((el) => getComputedStyle(el).lineHeight), '14px')
    const source = await page.locator('.podcast-write').boundingBox()
    const result = await page.locator('.podcast-read').boundingBox()
    assert.ok(result!.x > source!.x && result!.y === source!.y)
    await page.getByRole('separator').focus()
    await page.keyboard.press('ArrowLeft')
    assert.equal(await page.getByRole('separator').getAttribute('aria-valuenow'), '45')
    await page.getByRole('button', { name: 'Scrivi', exact: true }).click()
    assert.equal(await page.locator('.podcast-read').isVisible(), false)
    await page.getByRole('button', { name: 'Leggi', exact: true }).click()
    assert.equal(await page.locator('.podcast-write').isVisible(), false)
  })
  test('typing @ filters names; keyboard, pointer, Escape and the toolbar work', async (t) => {
    const page = await open(t)
    const input = page.getByRole('textbox', { name: 'Sorgente Markdown' })
    await input.fill('@')
    assert.equal(await page.getByRole('option').count(), 3)
    await input.press('ArrowDown')
    await input.press('Enter')
    assert.equal(await input.inputValue(), '@Elio ')
    await input.fill('@Ve')
    assert.equal(await page.getByRole('option').count(), 1)
    await input.press('Tab')
    assert.equal(await input.inputValue(), '@Vera ')
    await input.fill('@N')
    await page.getByRole('option', { name: '@Nora' }).click()
    assert.equal(await input.inputValue(), '@Nora ')
    await input.fill('mail@Nora')
    assert.equal(await page.getByRole('listbox').isVisible(), false)
    await input.fill('')
    await page.getByRole('button', { name: 'Partecipante', exact: true }).click()
    assert.equal(await page.getByRole('listbox').isVisible(), true)
    await input.press('Escape')
    assert.equal(await page.getByRole('listbox').isVisible(), false)
    assert.equal(await input.inputValue(), '@')
  })
  test('duration dialog edits the full tag, sums additions and excludes code', async (t) => {
    const page = await open(t)
    const input = page.locator('#podcast-input')
    await input.evaluate((el: HTMLTextAreaElement) => { const at = el.value.indexOf('time:') + 6; el.setSelectionRange(at, at) })
    await page.getByRole('button', { name: 'Durata della sezione', exact: true }).click()
    await page.getByLabel('Minuti', { exact: true }).fill('7')
    await page.getByLabel('Secondi', { exact: true }).fill('15')
    await page.getByLabel('Centesimi', { exact: true }).fill('25')
    await page.getByRole('button', { name: 'Inserisci durata', exact: true }).click()
    assert.ok((await input.inputValue()).includes('[](time:7:15:25)'))
    assert.equal(await page.locator('#podcast-total').textContent(), '7:15:25')
    await input.press('Control+End')
    await page.getByRole('button', { name: 'Durata della sezione', exact: true }).click()
    await page.getByRole('button', { name: 'Inserisci durata', exact: true }).click()
    assert.equal(await page.locator('#podcast-total').textContent(), '12:15:25')
    await input.fill('`[](time:99:00:00)`\n\n[](time:5:00:00) [](time:1:99:00)')
    assert.equal(await page.locator('#podcast-total').textContent(), '5:00:00')
    assert.match(await page.locator('#podcast-notice').textContent() ?? '', /non valida/)
    await input.fill('Nessuna durata')
    assert.equal(await page.locator('#podcast-total').textContent(), '0:00:00')
  })
  test('preview checkboxes edit only their own marker and keep the planned total', async (t) => {
    const page = await open(t)
    const input = page.locator('#podcast-input')
    await input.fill('`[x]` e \\[x] falso [ ] @Nora vero [](time:5:00:00)\n\n- [ ] secondo')
    await page.locator('#podcast-preview [data-task="0"]').click()
    assert.equal(await input.inputValue(), '`[x]` e \\[x] falso [x] @Nora vero [](time:5:00:00)\n\n- [ ] secondo')
    assert.equal(await page.locator('#podcast-total').textContent(), '5:00:00')
    await page.locator('#podcast-preview [data-task="1"]').click()
    assert.ok((await input.inputValue()).endsWith('- [x] secondo'))
  })
  test('document dialog creates and links a separate editor; tabs, local drafts and history stay independent', async (t) => {
    const page = await open(t)
    const input = page.locator('#podcast-input')
    const original = await input.inputValue()
    await input.press('Control+End')
    await page.getByRole('button', { name: 'Collega documento', exact: true }).click()
    await page.getByLabel('Nome documento', { exact: true }).fill('Gobbo Nora')
    await page.getByRole('button', { name: 'Collega e apri', exact: true }).click()
    assert.equal(await input.inputValue(), '# Gobbo Nora\n\n')
    await input.fill('@Nora Appunti [](time:90:00:00)')
    assert.equal(await page.locator('#podcast-total').textContent(), '5:00:00')
    await input.press('Control+z')
    assert.equal(await input.inputValue(), '# Gobbo Nora\n\n')
    await input.press('Control+Shift+z')
    assert.equal(await input.inputValue(), '@Nora Appunti [](time:90:00:00)')
    await page.getByRole('tab', { name: 'Scaletta', exact: true }).click()
    assert.equal(await input.inputValue(), original + '[scheda](Gobbo Nora)')
    await page.getByRole('button', { name: 'Apri scheda: Gobbo Nora', exact: true }).click()
    assert.equal(await input.inputValue(), '@Nora Appunti [](time:90:00:00)')
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('mdlib-podcast-sample-v2') ?? 'null')?.active === 'Gobbo Nora')
    await page.reload()
    assert.equal(await input.inputValue(), '@Nora Appunti [](time:90:00:00)')
    assert.equal(await page.locator('#podcast-total').textContent(), '5:00:00')
  })
  test('formatting respects selection; tasks and links are inserted from the toolbar', async (t) => {
    const page = await open(t)
    const input = page.locator('#podcast-input')
    await input.fill('Una parola')
    await input.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(4, 10))
    await page.getByRole('button', { name: 'Grassetto (Ctrl+B)', exact: true }).click()
    assert.equal(await input.inputValue(), 'Una **parola**')
    await input.press('Control+z')
    assert.equal(await input.inputValue(), 'Una parola')
    await page.getByRole('button', { name: 'Checkbox', exact: true }).click()
    assert.ok((await input.inputValue()).startsWith('[ ] '))
    await input.press('Control+End')
    await page.getByRole('button', { name: 'Inserisci link (Ctrl+K)', exact: true }).click()
    await page.getByLabel('Testo', { exact: true }).fill('sito')
    await page.getByLabel('Indirizzo', { exact: true }).fill('https://example.com')
    await page.getByRole('button', { name: 'Inserisci link', exact: true }).click()
    assert.ok((await input.inputValue()).endsWith('[sito](https://example.com)'))
    assert.equal(await page.locator('#podcast-preview a').getAttribute('href'), 'https://example.com')
    await page.context().route('https://example.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Destinazione</h1>' }))
    const source = await input.inputValue()
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('link', { name: 'sito', exact: true }).click()
    const popup = await popupPromise
    t.after(() => popup.close())
    await popup.waitForLoadState('domcontentloaded')
    assert.equal(popup.url(), 'https://example.com/')
    assert.equal(await popup.evaluate(() => window.opener), null)
    assert.equal(page.url(), 'http://podcast.test/')
    assert.equal(await input.inputValue(), source)
    await page.getByRole('tab', { name: 'Gobbo Vera', exact: true }).click()
    await input.fill('[fonte](https://example.com/note)')
    assert.equal(await page.getByRole('link', { name: 'fonte', exact: true }).getAttribute('target'), '_blank')
  })
  test('narrow screens stack panes without horizontal overflow; storage errors keep editing usable', async (t) => {
    const page = await open(t, 390, false)
    const source = await page.locator('.podcast-write').boundingBox()
    const result = await page.locator('.podcast-read').boundingBox()
    assert.ok(result!.y >= source!.y + source!.height)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    await page.locator('#podcast-input').fill('[ ] @Elio [](time:1:30:00)')
    await page.waitForFunction(() => document.querySelector('#podcast-save')?.textContent === 'Solo in questa sessione')
    assert.equal(await page.locator('#podcast-total').textContent(), '1:30:00')
    assert.equal(await page.locator('#podcast-preview .podcast-mention').textContent(), '@Elio')
  })

  test('hosting options: notify tasks, host documents, tags, clock timers, current line and running timer', async (t) => {
    const page = await openStudio(t)
    const preview = page.locator('#podcast-preview')
    assert.equal(await preview.locator('.podcast-check').count(), 4)
    assert.equal(await preview.locator('.podcast-check:disabled').count(), 0, 'notify mode needs no source ranges')
    assert.equal(await preview.locator('.podcast-tag[data-tag="campa"]').evaluate((el) => (el as HTMLElement).style.background), 'rgb(18, 52, 86)', 'fixed colour from tagColors')
    assert.equal(await preview.locator('.podcast-tag[data-tag="tema"]').evaluate((el) => (el as HTMLElement).style.background), 'rgb(0, 128, 0)', 'colour defined in the text')
    assert.deepEqual(await preview.locator('.podcast-time').allTextContents(), ['⏱ intro 04:30', '⏱ 1:05:00'])
    assert.equal(await preview.locator('.podcast-time.is-running').textContent(), '⏱ 1:05:00')
    assert.equal(await preview.locator('.is-current').evaluate((el) => el.textContent?.trim().slice(0, 8)), 'Apertura')
    assert.equal(await preview.locator('li').count(), 2)
    assert.equal(await preview.locator('li br').count(), 2, 'lazy continuation lines stay in the item, one per row')
    assert.equal(await page.locator('.podcast-header').isVisible(), false, 'compact hides the chrome')
    assert.equal(await page.locator('#podcast-tabs').isVisible(), false, 'host documents have no tabs')
    const before = await page.locator('#podcast-input').inputValue()
    await preview.locator('[data-line="4"][data-box="1"]').click()
    await preview.locator('[data-document]').click()
    const events = await page.evaluate(() => (window as unknown as { events: unknown[] }).events)
    assert.deepEqual(events, [
      ['task', { document: 'Scaletta', id: 3, checked: true, line: 4, box: 1 }],
      ['document', { name: 'Scheda ospite.md', title: 'Scheda ospite' }],
    ])
    assert.equal(await page.locator('#podcast-input').inputValue(), before, 'notify mode never edits the source')
    await page.evaluate(() => { const w = window as unknown as { editor: { setCurrent(l: number): void; setRunningTimer(t: null): void; setReadOnly(v: boolean): void } }; w.editor.setCurrent(4); w.editor.setRunningTimer(null); w.editor.setReadOnly(true) })
    assert.equal(await preview.locator('.is-current').evaluate((el) => el.textContent?.includes('da fare')), true)
    assert.equal(await preview.locator('.is-running').count(), 0)
    assert.equal(await page.locator('.podcast-toolbar').isVisible(), false, 'read-only hides the toolbar')
    assert.equal(await page.locator('.podcast-write').isVisible(), false, 'read-only hides the source')
    await preview.locator('[data-line="1"][data-box="0"]').click()
    assert.equal(await page.evaluate(() => (window as unknown as { events: unknown[] }).events.length), 3, 'read-only keeps the checkboxes live')
  })
})
