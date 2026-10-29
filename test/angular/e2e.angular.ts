// End-to-end tests of the Angular wrapper (bindings/angular) in Chromium:
// build the library and the SSR demo, start the demo's Node server, then
// check the server HTML, hydration, and drive the pages like a user would.
//
//   npm run build                       mdlib-pure's dist/ (the demo links it)
//   npm ci --prefix bindings/angular    once
//   npm run test:angular
//
// Needs the Node version of the Angular CLI (^22.22.3, ^24.15 or >=26). The
// demo runs on a free port and is always stopped, even when a test fails.
import assert from 'node:assert/strict'
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { type Browser, chromium, type Page } from 'playwright'
import { defineElements, getMarkdown } from '../../src/element.ts'
import { decodeEntity } from '../../src/entities/index.ts'
import { toc } from '../../src/plugins/headings.ts'
import { visit } from '../../src/util/visit.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const ANGULAR = join(ROOT, 'bindings/angular')
const SERVER = join(ANGULAR, 'dist/demo/server/server.mjs')
const TIMEOUT = 90_000

// --- The demo app -------------------------------------------------------------------

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.on('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const address = s.address()
      s.close(() => (address && typeof address === 'object' ? resolve(address.port) : reject(new Error('no port'))))
    })
  })
}

let app: ChildProcess | undefined
let appLog = ''
let base = ''
let browser: Browser

function stopApp(signal: NodeJS.Signals = 'SIGTERM'): void {
  if (app?.pid && app.exitCode === null && app.signalCode === null) {
    try {
      process.kill(-app.pid, signal)
    } catch {
      // already gone
    }
  }
}
process.on('exit', () => stopApp('SIGKILL'))

before(async () => {
  assert.ok(existsSync(join(ROOT, 'dist/element.js')), 'mdlib-pure is not built: run `npm run build` first')
  assert.ok(existsSync(join(ANGULAR, 'node_modules/@angular/core')), 'Angular dependencies missing: run `npm ci --prefix bindings/angular` first')
  // The library (ng-packagr), then the demo against it (browser + server bundles).
  execFileSync('npm', ['run', 'build'], { cwd: ANGULAR, stdio: ['ignore', 'ignore', 'inherit'] })

  base = `http://localhost:${await freePort()}`
  app = spawn(process.execPath, [SERVER], { cwd: ANGULAR, env: { ...process.env, PORT: new URL(base).port }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  app.stdout?.on('data', (d: Buffer) => (appLog += d))
  app.stderr?.on('data', (d: Buffer) => (appLog += d))

  const deadline = Date.now() + 60_000
  for (;;) {
    if (app.exitCode !== null) throw new Error(`the demo exited (${app.exitCode}):\n${appLog}`)
    try {
      if ((await fetch(base + '/katex/katex.min.css')).ok) break
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`the demo did not start in 60 s:\n${appLog}`)
    await new Promise((r) => setTimeout(r, 200))
  }
  browser = await chromium.launch()
})

after(async () => {
  await browser?.close()
  if (!app) return
  const exited = new Promise((r) => app!.once('exit', r))
  stopApp()
  const timer = setTimeout(() => stopApp('SIGKILL'), 5000)
  await exited
  clearTimeout(timer)
  assert.doesNotMatch(appLog, /error/i, `the server logged an error:\n${appLog}`)
})

// --- Helpers -----------------------------------------------------------------------

interface Session {
  page: Page
  /** Console errors and warnings, uncaught exceptions and failed requests. */
  problems: string[]
}

/** Server-rendered nodes that hydration must keep (not replace). */
const SSR_NODES = ['#status', '#outline', 'mdlib-editor', 'mdlib-markdown']

/** Record them once the HTML is parsed, before the app's module script runs. */
const RECORD_SSR = (selectors: string[]) => {
  document.addEventListener('readystatechange', () => {
    if (document.readyState !== 'interactive') return
    const w = window as unknown as { ssr: Record<string, Element | null> }
    w.ssr = Object.fromEntries(selectors.map((sel) => [sel, document.querySelector(sel)]))
  })
}

async function open(path: string): Promise<Session> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const problems: string[] = []
  page.on('console', (m) => (m.type() === 'error' || m.type() === 'warning') && problems.push(`console.${m.type()}: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`))
  await page.addInitScript(RECORD_SSR, SSR_NODES)
  await page.goto(base + path)
  return { page, problems }
}

async function close(s: Session): Promise<void> {
  await s.page.context().close()
  assert.deepEqual(s.problems, [], 'no console errors or warnings, page errors or failed requests')
}

/** The editor page is hydrated (afterNextRender ran in the browser). */
const interactive = (page: Page) => page.waitForSelector('#status[data-interactive="true"]', { timeout: 30_000 })

/** The viewer and the editor (toolbar, preview) have rendered the sample, math and diagram included. */
async function rendered(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      ['#viewer', '#editor .mdlib-editor-preview'].every((s) => document.querySelector(`${s} h1`) && document.querySelector(`${s} .katex`) && document.querySelector(`${s} :is(.mermaid, .mermaid-diagram) svg`)) &&
      document.querySelector('#editor .mdlib-editor-toolbar'),
    null,
    { timeout: 30_000 },
  )
}

const angularValue = (page: Page) => page.locator('#value').textContent().then((t) => t ?? '')

/** Preview text one animation frame after the last keystroke (the editor renders on the next frame). */
const previewNextFrame = (page: Page, editor = '#editor') =>
  page.evaluate((sel) => new Promise<string>((r) => requestAnimationFrame(() => r(document.querySelector(`${sel} .mdlib-editor-preview`)!.textContent ?? ''))), editor)

async function typeAtEnd(page: Page, text: string, editor = '#editor'): Promise<void> {
  await page.locator(`${editor} textarea`).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

async function clear(page: Page, editor: string): Promise<void> {
  await page.locator(`${editor} textarea`).click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Delete')
}

/** Click outside: the editor loses focus (pending value sent, then `change`). */
const blur = (page: Page) => page.locator('main h1').first().click()

// The named config the demo registers in app.config.ts, registered here too
// for expected(), with the entity table (Node has no DOM to decode them).
defineElements({
  configs: {
    demo: { decodeEntity, attributes: (node) => (node.type === 'link' && /^https?:/i.test(node.url as string) ? { target: '_blank', rel: 'noopener noreferrer' } : null) },
  },
})

/** What mdlib-pure computes in Node for the same text: the service results must match. */
function expected(markdown: string) {
  const md = getMarkdown('all', 'demo')
  let nodes = 0
  visit(md.parse(markdown), () => {
    nodes++
  })
  return { nodes, toc: toc(getMarkdown('all headings', 'demo').parse(markdown)), htmlLength: md.render(markdown).length }
}

/** The opening tag of an element in server HTML, and whether it is empty. */
function ssrElement(html: string, id: string) {
  const m = new RegExp(`<(mdlib-[a-z]+)\\b([^>]*\\bid="${id}"[^>]*)>([\\s\\S]*?)</\\1>`).exec(html)
  assert.ok(m, `#${id} in the server HTML`)
  const attrs = Object.fromEntries([...m[2].matchAll(/([a-z-]+)(?:="([^"]*)")?/g)].map((a) => [a[1], a[2] ?? '']))
  return { tag: m[1], attrs, content: m[3] }
}

// --- Server-side rendering -------------------------------------------------------------

describe('Server-side rendering', { timeout: TIMEOUT }, () => {
  test('the editor page: elements rendered empty with their attributes, hydration annotations, MarkdownService output', async () => {
    const res = await fetch(base + '/?delay=800')
    assert.equal(res.status, 200)
    const html = await res.text()
    const editor = ssrElement(html, 'editor')
    assert.equal(editor.tag, 'mdlib-editor')
    assert.equal(editor.content, '', 'the element renders its content in the browser')
    assert.equal(editor.attrs.ngskiphydration, 'true')
    assert.equal(editor.attrs.plugins, 'all')
    assert.equal(editor.attrs.config, 'demo')
    assert.equal(editor.attrs.delay, '800')
    assert.equal(editor.attrs.label, 'Release notes (Markdown)')
    assert.match(editor.attrs.value, /^---\ntitle: Release notes\n---\n\n# Release notes &amp;ndash; ngx-mdlib-pure\n/)
    const viewer = ssrElement(html, 'viewer')
    assert.equal(viewer.content, '')
    assert.equal(viewer.attrs.class, 'md viewer')
    assert.equal(viewer.attrs.source, editor.attrs.value)
    // MarkdownService.toc() on the server, entities decoded by mdlib-pure/entities.
    const outline = /<ol id="outline">([\s\S]*?)<\/ol>/.exec(html)![1]
    assert.deepEqual([...outline.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((m) => m[1]), ['Release notes – ngx-mdlib-pure', "What's new", 'Math and diagrams'])
    assert.match(html, /<p id="status"[^>]*>(<!---->)?\s*Server-rendered/)
    assert.match(html, /\bngh="\d+"/, 'hydration annotations')
    assert.match(html, /<script id="ng-state" type="application\/json">/)
    assert.doesNotMatch(html, /NG0\d{3}|Error:/)
  })

  test('the forms page (a lazy route) renders on the server too', async () => {
    const res = await fetch(base + '/forms')
    assert.equal(res.status, 200)
    const html = await res.text()
    for (const id of ['description-editor', 'notes-editor']) {
      const el = ssrElement(html, id)
      assert.equal(el.content, '')
      assert.equal(el.attrs.ngskiphydration, 'true')
    }
    assert.match(ssrElement(html, 'description-editor').attrs.value, /^A \*\*short\*\* description/)
    assert.equal(ssrElement(html, 'notes-editor').attrs.name, 'notes')
    assert.match(html, /<p id="form-status"[^>]*>Form status: VALID/)
  })
})

// --- Hydration ------------------------------------------------------------------------

describe('Hydration', { timeout: TIMEOUT }, () => {
  test('the server DOM is kept, the elements upgrade and render, math and diagrams included, without console errors', async () => {
    const s = await open('/')
    await interactive(s.page)
    await rendered(s.page)
    const r = await s.page.evaluate(async (selectors) => {
      await document.fonts.ready
      const w = window as unknown as { ssr: Record<string, Element | null> }
      const editor = document.querySelector('mdlib-editor')!
      return {
        recorded: selectors.every((sel) => w.ssr[sel] instanceof Element),
        kept: selectors.filter((sel) => w.ssr[sel] === document.querySelector(sel)),
        defined: !!customElements.get('mdlib-editor') && !!customElements.get('mdlib-markdown'),
        toolbars: document.querySelectorAll('.mdlib-editor-toolbar').length,
        textarea: editor.querySelector('textarea')!.value === editor.getAttribute('value'),
        theme: getComputedStyle(document.querySelector('#viewer .md-container')!).getPropertyValue('--md-container').trim() !== '',
        editorDisplay: getComputedStyle(editor).display,
        katexFont: document.fonts.check('16px KaTeX_Main'),
        mathmlHidden: getComputedStyle(document.querySelector('#viewer .katex-mathml')!).position,
        externalLinks: [...document.querySelectorAll<HTMLAnchorElement>('#viewer a[href^="http"]')].every((a) => a.target === '_blank'),
      }
    }, SSR_NODES)
    assert.deepEqual(r, {
      recorded: true,
      kept: SSR_NODES,
      defined: true,
      toolbars: 1,
      textarea: true,
      theme: true,
      editorDisplay: 'grid',
      katexFont: true,
      mathmlHidden: 'absolute',
      externalLinks: true,
    })
    await close(s)
  })

  test('the forms page hydrates too, with valid forms', async () => {
    const s = await open('/forms')
    await s.page.waitForSelector('#notes-editor .mdlib-editor-toolbar')
    await s.page.waitForSelector('#description-editor .mdlib-editor-toolbar')
    assert.equal(await s.page.getAttribute('#form-status', 'data-status'), 'VALID')
    assert.equal(await s.page.getAttribute('#notes-status', 'data-valid'), 'true')
    await close(s)
  })
})

// --- Editor page ------------------------------------------------------------------------

describe('Editor page', { timeout: TIMEOUT }, () => {
  test('typing updates the preview at once and the Angular value after the delay', async () => {
    const s = await open('/?delay=800')
    await interactive(s.page)
    await rendered(s.page)
    await typeAtEnd(s.page, '\n\n## Typed *here*')
    const preview = await previewNextFrame(s.page)
    const valueBefore = await angularValue(s.page)
    await s.page.waitForFunction(() => document.querySelector('#value')!.textContent!.endsWith('## Typed *here*'), null, { timeout: 10_000 })
    assert.ok(preview.includes('Typed here'), 'preview rendered on the next frame')
    assert.ok(!valueBefore.includes('Typed'), 'the Angular value waits for the typing pause')
    assert.ok((await s.page.locator('#viewer').textContent())!.includes('Typed here'), 'the viewer follows the Angular value')
    assert.ok((await s.page.locator('#outline').textContent())!.includes('Typed here'), 'the outline (MarkdownService) follows too')
    await close(s)
  })

  test('fast typing with every keystroke sent (delay 0) loses nothing', async () => {
    const s = await open('/?delay=0')
    await interactive(s.page)
    await rendered(s.page)
    const initial = await s.page.locator('#editor textarea').inputValue()
    const typed = '\n\n' + 'The quick brown fox jumps over the lazy dog. '.repeat(6)
    await typeAtEnd(s.page, typed)
    await s.page.waitForFunction((v) => document.querySelector('#value')!.textContent === v, initial + typed, { timeout: 20_000 })
    assert.equal(await s.page.locator('#editor textarea').inputValue(), initial + typed, 'no echo overwrote the textarea')
    await close(s)
  })

  test('valueCommit fires on blur', async () => {
    const s = await open('/?delay=5000')
    await interactive(s.page)
    await rendered(s.page)
    await typeAtEnd(s.page, '\n\nCommitted')
    await blur(s.page)
    await s.page.waitForFunction(() => document.querySelector('#value')!.textContent!.endsWith('Committed'), null, { timeout: 5000 })
    assert.match((await s.page.locator('#value-length').textContent())!, /1 commits/)
    await close(s)
  })

  test('AST, table of contents and HTML from MarkdownService match mdlib-pure in Node', async () => {
    const s = await open('/')
    await interactive(s.page)
    await rendered(s.page)
    await typeAtEnd(s.page, '\n\n## From the test')
    await blur(s.page)
    await s.page.waitForFunction(() => document.querySelector('#value')!.textContent!.endsWith('From the test'))
    await s.page.click('#ast')
    await s.page.waitForSelector('#ast-count')
    const want = expected(await angularValue(s.page))
    assert.equal(Number((await s.page.locator('#ast-count strong').textContent())!), want.nodes)
    assert.equal(await s.page.locator('#ast-html').textContent(), `HTML: ${want.htmlLength} characters`)
    const entries = await s.page.locator('#toc li').evaluateAll((lis) => lis.map((li) => ({ depth: Number((li as HTMLElement).dataset.depth), id: li.querySelector('code')!.textContent!.slice(1), text: li.querySelector('a')!.textContent })))
    assert.deepEqual(entries, want.toc)
    assert.equal(entries[0].text, 'Release notes – ngx-mdlib-pure')
    assert.equal(entries.at(-1)?.id, 'from-the-test')
    await close(s)
  })
})

// --- Forms ---------------------------------------------------------------------------------

describe('Forms', { timeout: TIMEOUT }, () => {
  test('reactive form: validity follows the text, touched on blur, reset, disable', async () => {
    const s = await open('/forms')
    const status = () => s.page.getAttribute('#form-status', 'data-status')
    await s.page.waitForSelector('#description-editor .mdlib-editor-toolbar')
    assert.equal(await status(), 'VALID')

    await clear(s.page, '#description-editor')
    await s.page.waitForFunction(() => document.querySelector('#form-status')!.getAttribute('data-status') === 'INVALID')
    assert.equal(await s.page.isDisabled('#save'), true)
    assert.equal(await s.page.locator('#description-error').count(), 0, 'no error before the editor is touched')
    await blur(s.page)
    await s.page.waitForSelector('#description-error')
    assert.match((await s.page.getAttribute('#description-editor', 'class'))!, /\bng-invalid\b.*\bng-touched\b|\bng-touched\b.*\bng-invalid\b/)

    await typeAtEnd(s.page, 'New *description*', '#description-editor')
    await s.page.waitForFunction(() => document.querySelector('#form-status')!.getAttribute('data-status') === 'VALID')
    await s.page.click('#save')
    await s.page.waitForFunction(() => document.querySelector('#saved h2')?.textContent === 'Release 1.0' && document.querySelector('#saved em')?.textContent === 'description')

    await s.page.click('#reset')
    await s.page.waitForFunction(() => (document.querySelector('#description-editor') as HTMLElement & { value: string }).value.startsWith('A **short** description'))
    assert.match((await previewNextFrame(s.page, '#description-editor'))!, /^A short description/)

    await s.page.click('#toggle')
    await s.page.waitForSelector('#description-editor:disabled textarea:disabled')
    assert.equal(await s.page.evaluate(() => new FormData(document.querySelector('#article-form') as HTMLFormElement).has('description')), false)
    await s.page.click('#toggle')
    await s.page.waitForSelector('#description-editor:enabled textarea:enabled')
    await typeAtEnd(s.page, ' Again.', '#description-editor')
    await s.page.waitForFunction(() => (document.querySelector('#description-editor') as HTMLElement & { value: string }).value.endsWith('Again.'))
    await close(s)
  })

  test('ngModel: the model follows the text, required validity', async () => {
    const s = await open('/forms')
    await s.page.waitForSelector('#notes-editor .mdlib-editor-toolbar')
    await typeAtEnd(s.page, '\n- three', '#notes-editor')
    await s.page.waitForFunction(() => document.querySelector('#notes-value')!.textContent!.endsWith('- three'))
    await clear(s.page, '#notes-editor')
    await s.page.waitForFunction(() => document.querySelector('#notes-status')!.getAttribute('data-valid') === 'false')
    assert.equal(await s.page.locator('#notes-value').textContent(), '')
    // The element is form-associated: a native form post would send the text under `name`.
    await typeAtEnd(s.page, 'Posted', '#notes-editor')
    await s.page.waitForFunction(() => new FormData(document.querySelector('#notes-form') as HTMLFormElement).get('notes') === 'Posted')
    await close(s)
  })
})

// --- Client-side navigation ----------------------------------------------------------------

describe('Client-side navigation', { timeout: TIMEOUT }, () => {
  test('elements created by Angular in the browser (no hydration) render the same', async () => {
    const s = await open('/')
    await interactive(s.page)
    await rendered(s.page)
    await s.page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
    await s.page.click('#nav-forms')
    await s.page.waitForSelector('#description-editor .mdlib-editor-toolbar')
    await s.page.waitForSelector('#notes-editor .mdlib-editor-preview li')
    assert.equal(await s.page.getAttribute('#form-status', 'data-status'), 'VALID')
    await s.page.click('#nav-editor')
    await rendered(s.page)
    const r = await s.page.evaluate(() => ({ spa: (window as unknown as { marker?: number }).marker === 1, editors: document.querySelectorAll('mdlib-editor').length, toolbars: document.querySelectorAll('.mdlib-editor-toolbar').length }))
    assert.deepEqual(r, { spa: true, editors: 1, toolbars: 1 })
    await typeAtEnd(s.page, '\n\nAfter navigation')
    await s.page.waitForFunction(() => document.querySelector('#value')!.textContent!.endsWith('After navigation'), null, { timeout: 5000 })
    await close(s)
  })
})
