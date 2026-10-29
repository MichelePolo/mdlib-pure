// End-to-end tests of the Blazor wrapper (bindings/blazor) in Chromium: build
// and start the demo app, then drive every render mode like a user would.
//
//   npm run blazor:assets   once, and after changing src/ or styles/
//   npm run test:blazor
//
// Needs the .NET 10 SDK: `dotnet` on PATH, in DOTNET_ROOT, or in ~/.dotnet.
// The demo runs on a free port and is always stopped, even when a test fails.
import assert from 'node:assert/strict'
import { type ChildProcess, execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { type Browser, type BrowserContext, chromium, type Page } from 'playwright'
import { defineElements, getMarkdown } from '../../src/element.ts'
import { toc } from '../../src/plugins/headings.ts'
import { visit } from '../../src/util/visit.ts'

const ROOT = new URL('../../', import.meta.url).pathname
const BLAZOR = join(ROOT, 'bindings/blazor')
const DEMO = join(BLAZOR, 'samples/MdlibPure.Blazor.Demo/MdlibPure.Blazor.Demo')
const TIMEOUT = 90_000

// --- The demo app -------------------------------------------------------------------

function findDotnet(): string {
  const candidates = [process.env.DOTNET_ROOT && join(process.env.DOTNET_ROOT, 'dotnet'), join(homedir(), '.dotnet/dotnet')]
  for (const c of candidates) if (c && existsSync(c)) return c
  return 'dotnet' // on PATH (CI: actions/setup-dotnet)
}

const DOTNET = findDotnet()
const env = { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_NOLOGO: '1', ASPNETCORE_ENVIRONMENT: 'Development' }

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

/** Stop the demo: `dotnet run` starts the app as a child process, so kill the whole group. */
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
  const assets = join(BLAZOR, 'src/MdlibPure.Blazor/wwwroot/dist/mdlib-element.js')
  assert.ok(existsSync(assets), 'Blazor assets missing: run `npm run blazor:assets` first')
  execFileSync(DOTNET, ['build', DEMO, '--nologo', '-v', 'quiet', '-clp:ErrorsOnly'], { env, stdio: 'inherit' })

  base = `http://127.0.0.1:${await freePort()}`
  app = spawn(DOTNET, ['run', '--no-build', '--no-launch-profile', '--project', DEMO, '--urls', base], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  app.stdout?.on('data', (d: Buffer) => (appLog += d))
  app.stderr?.on('data', (d: Buffer) => (appLog += d))

  const deadline = Date.now() + 120_000
  for (;;) {
    if (app.exitCode !== null) throw new Error(`the demo exited (${app.exitCode}):\n${appLog}`)
    try {
      if ((await fetch(base + '/')).ok) break
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`the demo did not start in 120 s:\n${appLog}`)
    await new Promise((r) => setTimeout(r, 250))
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
})

// --- Helpers -----------------------------------------------------------------------

interface Session {
  context: BrowserContext
  page: Page
  /** Console errors, uncaught exceptions and failed requests. */
  problems: string[]
}

async function open(path: string, context?: BrowserContext): Promise<Session> {
  context ??= await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`))
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
  page.on('response', (r) => r.status() >= 400 && problems.push(`HTTP ${r.status()} ${r.url()}`))
  await page.goto(base + path)
  return { context, page, problems }
}

async function close(s: Session): Promise<void> {
  await s.context.close()
  assert.deepEqual(s.problems, [], 'no console errors, page errors or failed requests')
}

const interactive = (page: Page) => page.waitForSelector('#status[data-interactive="true"]', { timeout: 60_000 })

/** The viewer and the editor (toolbar, preview) have rendered the sample, math and diagram included. */
async function rendered(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      // Diagrams: drawn by Mermaid in <pre class="mermaid">, or restored from the element's cache.
      ['#viewer', '.mdlib-editor-preview'].every((s) => document.querySelector(`${s} h1`) && document.querySelector(`${s} .katex`) && document.querySelector(`${s} :is(.mermaid, .mermaid-diagram) svg`)) &&
      document.querySelector('mdlib-editor .mdlib-editor-toolbar'),
    null,
    { timeout: 30_000 },
  )
}

/** Styles in effect: theme, editor and KaTeX (adopted by the JS initializer), KaTeX fonts loaded. */
function styles(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready
    const container = document.querySelector('#viewer .md-container')!
    return {
      theme: getComputedStyle(container).getPropertyValue('--md-container').trim() !== '',
      editor: getComputedStyle(document.querySelector('mdlib-editor')!).display,
      katexFont: document.fonts.check('16px KaTeX_Main'),
      mathmlHidden: getComputedStyle(document.querySelector('#viewer .katex-mathml')!).position,
      adopted: document.adoptedStyleSheets.length,
    }
  })
}

const csharpValue = (page: Page) => page.locator('#value').textContent().then((t) => t ?? '')

/** Preview text one animation frame after the last keystroke (the editor renders on the next frame). */
const previewNextFrame = (page: Page) =>
  page.evaluate(() => new Promise<string>((r) => requestAnimationFrame(() => r(document.querySelector('.mdlib-editor-preview')!.textContent ?? ''))))

async function typeAtEnd(page: Page, text: string): Promise<void> {
  await page.locator('mdlib-editor textarea').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

// The named config the demo registers in its own JS initializer
// (MdlibPure.Blazor.Demo.lib.module.js), registered here too for expected().
defineElements({
  configs: {
    demo: { attributes: (node) => (node.type === 'link' && /^https?:/i.test(node.url as string) ? { target: '_blank', rel: 'noopener noreferrer' } : null) },
  },
})

/** What mdlib-pure computes in Node for the same text: the C# results must match. */
function expected(markdown: string) {
  const md = getMarkdown('all', 'demo')
  let nodes = 0
  visit(md.parse(markdown), () => {
    nodes++
  })
  return { nodes, toc: toc(getMarkdown('all headings', 'demo').parse(markdown)), htmlLength: md.render(markdown).length }
}

/** The app's named config reached both elements: external links open in a new tab. */
function configApplied(page: Page) {
  return page.evaluate(() =>
    ['#viewer', '.mdlib-editor-preview'].map((s) => {
      const links = [...document.querySelectorAll<HTMLAnchorElement>(`${s} a[href^="http"]`)]
      return links.length > 0 && links.every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer')
    }),
  )
}

// --- Interactive render modes -------------------------------------------------------

for (const [mode, path, renderer] of [
  ['Interactive Server', '/server', 'Server'],
  ['Interactive WebAssembly', '/wasm', 'WebAssembly'],
  ['Interactive Auto', '/auto', 'Server'], // a first visit: WebAssembly is not downloaded yet
] as const) {
  describe(mode, { timeout: TIMEOUT }, () => {
    test('the elements render, with math, diagrams and styles', async () => {
      const s = await open(path)
      await interactive(s.page)
      await rendered(s.page)
      assert.equal(await s.page.getAttribute('#status', 'data-renderer'), renderer)
      assert.deepEqual(await styles(s.page), { theme: true, editor: 'grid', katexFont: true, mathmlHidden: 'absolute', adopted: 3 })
      assert.deepEqual(await configApplied(s.page), [true, true])
      assert.equal(await s.page.getAttribute('mdlib-editor', 'inert'), null)
      await close(s)
    })

    test('typing updates the preview at once and the C# value after the delay', async () => {
      const s = await open(`${path}?delay=800`)
      await interactive(s.page)
      await rendered(s.page)
      await typeAtEnd(s.page, '\n\n## Typed *here*')
      const preview = await previewNextFrame(s.page)
      const valueBefore = await csharpValue(s.page)
      await s.page.waitForFunction(() => document.querySelector('#value')!.textContent!.endsWith('## Typed *here*'), null, { timeout: 10_000 })
      assert.ok(preview.includes('Typed here'), 'preview rendered on the next frame')
      assert.ok(!valueBefore.includes('Typed'), 'the C# value waits for the typing pause')
      assert.ok((await s.page.locator('#viewer').textContent())!.includes('Typed here'), 'the viewer follows the C# value')
      await close(s)
    })

    test('fast typing with every keystroke sent (delay 0) loses nothing', async () => {
      const s = await open(`${path}?delay=0`)
      await interactive(s.page)
      await rendered(s.page)
      const initial = await s.page.locator('mdlib-editor textarea').inputValue()
      const typed = '\n\n' + 'The quick brown fox jumps over the lazy dog. '.repeat(6)
      await typeAtEnd(s.page, typed)
      await s.page.waitForFunction((v) => document.querySelector('#value')!.textContent === v, initial + typed, { timeout: 20_000 })
      assert.equal(await s.page.locator('mdlib-editor textarea').inputValue(), initial + typed, 'no echo overwrote the textarea')
      await close(s)
    })

    test('AST, table of contents and HTML from C# match mdlib-pure', async () => {
      const s = await open(path)
      await interactive(s.page)
      await rendered(s.page)
      await typeAtEnd(s.page, '\n\n## From the test')
      await s.page.locator('body').click({ position: { x: 1, y: 1 } }) // blur: the value is sent at once
      await s.page.waitForFunction(() => document.querySelector('#value')!.textContent!.endsWith('From the test'))
      await s.page.click('#ast')
      await s.page.waitForSelector('#ast-count')
      const want = expected(await csharpValue(s.page))
      assert.equal(Number((await s.page.locator('#ast-count strong').textContent())!), want.nodes)
      assert.equal(await s.page.locator('#ast-html').textContent(), `HTML: ${want.htmlLength} characters`)
      const entries = await s.page.locator('#toc li').evaluateAll((lis) => lis.map((li) => ({ depth: Number((li as HTMLElement).dataset.depth), id: li.querySelector('code')!.textContent!.slice(1), text: li.querySelector('a')!.textContent })))
      assert.deepEqual(entries, want.toc)
      assert.equal(entries.at(-1)?.id, 'from-the-test')
      assert.equal(await s.page.locator('#ast-error').count(), 0)
      await close(s)
    })
  })
}

describe('Interactive Server, specifics', { timeout: TIMEOUT }, () => {
  test('a 200 KB document reaches C# (MaximumReceiveMessageSize raised in Program.cs)', async () => {
    const s = await open('/server')
    await interactive(s.page)
    await rendered(s.page)
    const big = '# Big\n\n' + 'Lorem ipsum dolor sit amet, **consectetur** adipiscing elit.\n\n'.repeat(3300)
    await s.page.evaluate((text) => {
      const ta = document.querySelector('mdlib-editor textarea') as HTMLTextAreaElement
      ta.focus()
      ta.value = text
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    }, big)
    await s.page.waitForFunction((n) => document.querySelector('#value-length')!.textContent === `${n} characters`, big.length, { timeout: 20_000 })
    await s.page.click('#ast') // and back: the AST of 200 KB is streamed, not one SignalR message
    await s.page.waitForSelector('#ast-count', { timeout: 20_000 })
    assert.equal(Number((await s.page.locator('#ast-count strong').textContent())!), expected(big).nodes)
    await close(s)
  })
})

describe('Interactive Auto, specifics', { timeout: TIMEOUT }, () => {
  test('runs on the server first, on WebAssembly once it is downloaded', async () => {
    const s = await open('/auto')
    await interactive(s.page)
    assert.equal(await s.page.getAttribute('#status', 'data-renderer'), 'Server')
    await s.page.goto(base + '/wasm') // downloads the WebAssembly runtime
    await interactive(s.page)
    await s.page.goto(base + '/auto')
    await interactive(s.page)
    await rendered(s.page)
    assert.equal(await s.page.getAttribute('#status', 'data-renderer'), 'WebAssembly')
    await close(s)
  })
})

describe('Prerendering', { timeout: TIMEOUT }, () => {
  test('the editor is inert until the component is interactive, then replaced by a live one', async () => {
    const context = await browser.newContext()
    let release = (): void => {}
    const held = new Promise<void>((r) => (release = r))
    // Hold the WebAssembly runtime: the prerendered page stays non-interactive.
    await context.route(/\/_framework\/dotnet(\.[a-z0-9]+)?\.js$/, async (route) => {
      await held
      await route.continue()
    })
    const s = await open('/wasm', context)
    await s.page.waitForSelector('mdlib-editor .mdlib-editor-toolbar')
    const prerendered = await s.page.evaluate(() => ({
      status: document.querySelector<HTMLElement>('#status')!.dataset.interactive,
      inert: document.querySelector('mdlib-editor')!.hasAttribute('inert'),
      preview: !!document.querySelector('.mdlib-editor-preview h1'),
    }))
    release()
    await interactive(s.page)
    await rendered(s.page)
    assert.deepEqual(prerendered, { status: 'false', inert: true, preview: true })
    assert.equal(await s.page.getAttribute('mdlib-editor', 'inert'), null)
    await close(s)
  })
})

// --- Static SSR -----------------------------------------------------------------------

describe('Static SSR', { timeout: TIMEOUT }, () => {
  test('the elements render without interactivity, with math, diagrams and styles', async () => {
    const s = await open('/ssr')
    await rendered(s.page)
    assert.equal(await s.page.getAttribute('#status', 'data-interactive'), 'false')
    assert.deepEqual(await styles(s.page), { theme: true, editor: 'grid', katexFont: true, mathmlHidden: 'absolute', adopted: 3 })
    assert.deepEqual(await configApplied(s.page), [true, true])
    assert.equal(await s.page.getAttribute('mdlib-editor', 'inert'), null)
    assert.equal(await s.page.getAttribute('mdlib-editor', 'name'), 'Input.Body')
    await close(s)
  })

  test('typing updates the preview; the C# value changes only with the form POST', async () => {
    const s = await open('/ssr')
    await rendered(s.page)
    const before = await csharpValue(s.page)
    await typeAtEnd(s.page, '\n\nPosted *from* SSR')
    assert.ok((await previewNextFrame(s.page)).includes('Posted from SSR'))
    await s.page.waitForTimeout(400) // past the editor's debounce: still nothing sent anywhere
    assert.equal(await csharpValue(s.page), before)

    await s.page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
    await s.page.click('#save')
    await s.page.waitForSelector('#saved')
    await rendered(s.page)
    const r = await s.page.evaluate(() => ({
      enhanced: (window as unknown as { marker?: number }).marker === 1,
      value: document.querySelector('#value')!.textContent!.endsWith('Posted *from* SSR'),
      viewer: document.querySelector('#viewer')!.textContent!.includes('Posted from SSR'),
      editor: (document.querySelector('mdlib-editor') as HTMLElement & { value: string }).value.endsWith('Posted *from* SSR'),
    }))
    assert.deepEqual(r, { enhanced: true, value: true, viewer: true, editor: true })
    assert.match((await s.page.locator('#saved').textContent())!, new RegExp(`Received ${before.length + '\n\nPosted *from* SSR'.length} characters`))

    // The editor still works after the enhanced POST patched the page.
    await typeAtEnd(s.page, ' again')
    assert.ok((await previewNextFrame(s.page)).includes('Posted from SSR again'))
    await close(s)
  })

  test('IMarkdownService explains that it needs an interactive render mode', async () => {
    const s = await open('/ssr')
    const message = await s.page.locator('#ast-error').textContent()
    assert.match(message!, /IMarkdownService needs JavaScript interop.*interactive render mode/)
    await close(s)
  })

  test("the editor's value is form data under the generated name (what any form post sends)", async () => {
    const s = await open('/ssr')
    await rendered(s.page)
    const form = await s.page.evaluate(() => new FormData(document.querySelector('form')!).get('Input.Body'))
    assert.equal(form, await s.page.locator('mdlib-editor textarea').inputValue())
    await close(s)
  })
})

// --- Enhanced navigation ------------------------------------------------------------

describe('Enhanced navigation', { timeout: TIMEOUT * 2 }, () => {
  test('moving between all pages keeps the elements rendered and the styles in place', async () => {
    const s = await open('/ssr')
    await rendered(s.page)
    await s.page.evaluate(() => ((window as unknown as { marker: number }).marker = 1))
    for (const href of ['server', 'wasm', 'auto', 'ssr', 'server', 'ssr']) {
      await s.page.click(`header nav a[href="${href}"]`)
      await s.page.waitForURL(`**/${href}`)
      if (href !== 'ssr') await interactive(s.page)
      await rendered(s.page)
      const state = await s.page.evaluate(() => ({
        enhanced: (window as unknown as { marker?: number }).marker === 1,
        editors: document.querySelectorAll('mdlib-editor').length,
        toolbars: document.querySelectorAll('.mdlib-editor-toolbar').length,
      }))
      assert.deepEqual(state, { enhanced: true, editors: 1, toolbars: 1 }, href)
      assert.deepEqual(await styles(s.page), { theme: true, editor: 'grid', katexFont: true, mathmlHidden: 'absolute', adopted: 3 }, href)
    }
    // The home page has a viewer only.
    await s.page.click('header a.brand')
    await s.page.waitForSelector('#home-viewer table')
    await close(s)
  })
})
