// Run after site:build, with site:serve running. Uses the existing dev dependency.
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:4173/podcast/'
const destination = new URL('./', import.meta.url)
await mkdir(destination, { recursive: true })
const browser = await chromium.launch()
async function capture(file, prepare, mobile = false) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 1800 } : { width: 1440, height: 1500 }, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    // The image contains the application card; keep the site's sticky nav out.
    await page.addStyleTag({ content: '.bar { position: static; }' })
    if (prepare) await prepare(page)
    await page.waitForFunction(() => document.querySelector('#podcast-save')?.textContent !== 'Salvataggio…')
    await page.locator('.podcast').screenshot({ path: fileURLToPath(new URL(file, destination)), animations: 'disabled' })
    if (errors.length) throw new Error(errors.join('\n'))
    console.log(file)
  } finally { await page.close() }
}
try {
  await capture('01-editor-split-desktop.png')
  await capture('02-scelta-partecipante.png', async (page) => {
    const input = page.locator('#podcast-input')
    await input.focus()
    await input.evaluate((el) => { const at = el.value.indexOf('@Vera'); el.setSelectionRange(at, at + '@Vera'.length) })
    await input.pressSequentially('@')
    await page.getByRole('listbox').waitFor({ state: 'visible' })
  })
  await capture('03-durata-sezione.png', async (page) => {
    await page.getByRole('button', { name: 'Durata della sezione', exact: true }).click()
  })
  await capture('04-documento-collegato.png', async (page) => {
    await page.getByRole('button', { name: 'Apri scheda: Gobbo Vera', exact: true }).click()
  })
  await capture('05-editor-split-mobile.png', null, true)
} finally { await browser.close() }
