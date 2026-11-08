// Playground: the demo editor, extended. Markdown on the left, output on the
// right (Preview / HTML / AST), samples, plugin toggles, sharing through the
// URL hash, a local draft, KaTeX on demand, offline through a service worker.
import { COMMANDS, insertCommand } from '../lib/editor-commands.js'
import { renderMermaid } from '../../src/plugins/mermaid.ts'
import { createMarkdown } from '../../src/index.ts'
import { toDom } from '../../src/render/dom.ts'
import { highlight } from '../lib/highlight.js'
import { PLUGINS, pluginsFor } from '../lib/plugins.js'
import samples from 'virtual:samples'

const $ = (id) => document.getElementById(id)
const src = $('src')
const preview = $('panel-preview')
const htmlCode = document.querySelector('#panel-html code')
const astCode = document.querySelector('#panel-ast code')
const sampleSelect = $('pg-sample')
const highlightBox = $('pg-highlight')
const pluginBoxes = [...document.querySelectorAll('input[name="plugin"]')]
const status = $('pg-status')
const count = $('pg-count')
const tabs = [...document.querySelectorAll('[role="tab"]')]
const DRAFT = 'mdlib-pure:playground'
const KNOWN = new Set(PLUGINS.filter((p) => p.playground !== false).map((p) => p.id))

const state = { plugins: new Set(['gfm']), highlight: true, tab: 'preview' }
let md = build()

function build() {
  return createMarkdown({ plugins: pluginsFor([...state.plugins]), highlight: state.highlight ? highlight : undefined })
}

// Proportional scroll synchronization: rendered blocks and source lines have
// different heights. Ignore only the scroll event produced by our own write,
// rather than locking a pane for a timer (which would swallow user gestures).
let scrollLeader = src
let scrollFrame = 0
const expectedScroll = new WeakMap()
const outputPanels = ['preview', 'html', 'ast'].map(id => $('panel-' + id))
function syncScroll() {
  if (document.querySelector('main.pg').dataset.mode !== 'split') return
  const output = $('panel-' + state.tab)
  const from = scrollLeader === src ? src : output
  const to = from === src ? output : src
  const range = from.scrollHeight - from.clientHeight
  if (range <= 0) return
  const ratio = Math.max(0, Math.min(1, from.scrollTop / range))
  const top = ratio * Math.max(0, to.scrollHeight - to.clientHeight)
  if (Math.abs(to.scrollTop - top) < 1) return
  to.scrollTop = top
  expectedScroll.set(to, to.scrollTop)
}
function scheduleScrollSync() {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(syncScroll)
}
for (const pane of [src, ...outputPanels]) {
  pane.addEventListener('scroll', () => {
    const expected = expectedScroll.get(pane)
    expectedScroll.delete(pane)
    if (expected !== undefined && Math.abs(pane.scrollTop - expected) < 1) return
    if (pane !== src && pane.hidden) return
    scrollLeader = pane
    scheduleScrollSync()
  }, { passive: true })
}
// Images, fonts and asynchronous renderers can change the output's height.
preview.addEventListener('load', scheduleScrollSync, true)
new ResizeObserver(scheduleScrollSync).observe(src)
new ResizeObserver(scheduleScrollSync).observe(preview)
document.fonts.ready.then(scheduleScrollSync)

// --- Rendering --------------------------------------------------------------

let katex
function loadKatex() {
  const base = document.querySelector('[data-katex-base]').dataset.katexBase
  const script = (file) =>
    new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = base + file
      s.onload = resolve
      s.onerror = () => reject(new Error(`could not load ${file}`))
      document.head.append(s)
    })
  katex ??= (() => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = `${base}katex.min.css`
    document.head.append(css)
    return script('katex.min.js').then(() => script('contrib/auto-render.min.js'))
  })()
  return katex
}

function typeset(target = preview) {
  return loadKatex()
    .then(() =>
      window.renderMathInElement(target, {
        delimiters: [
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
      }),
    )
    .then(() => { if (target === preview) scheduleScrollSync() })
    .catch((e) => { status.textContent = `Math not typeset: ${e.message}`; if (target !== preview) throw e })
}

const loadMermaid = () => import(new URL('../mermaid/mermaid.js', import.meta.url).href)
let diagramQueue = Promise.resolve()
function queueDiagrams() {
  diagramQueue = diagramQueue.catch(() => {}).then(async () => {
    if (state.tab !== 'preview' || !preview.querySelector('pre.mermaid:not([data-processed])')) return
    try { await renderMermaid(preview, { load: loadMermaid, watch: false }); preview.dataset.diagramsReady = 'true'; scheduleScrollSync() }
    catch { status.textContent = 'Diagramma non disponibile: verifica la sintassi o la connessione.' }
  })
}
new MutationObserver(() => schedule()).observe(document.querySelector('meta[name="color-scheme"]'), { attributes: true })

function render() {
  const text = src.value
  try {
    if (state.tab === 'preview') {
      delete preview.dataset.diagramsReady
      md.renderTo(preview, text)
      queueDiagrams()
      if (state.plugins.has('math') && preview.querySelector('.math')) typeset()
    } else if (state.tab === 'html') {
      htmlCode.replaceChildren(toDom(highlight(md.render(text), 'html')))
    } else {
      astCode.replaceChildren(toDom(highlight(JSON.stringify(md.parse(text), null, 2), 'json')))
    }
  } catch (e) {
    status.textContent = `Render error: ${e.message}`
  }
  const lines = text ? text.split('\n').length : 0
  count.textContent = `${lines} ${lines === 1 ? 'line' : 'lines'}, ${text.length} chars`
  scheduleScrollSync()
}

let frame = 0
const schedule = () => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(render)
}

// --- State ------------------------------------------------------------------

function syncControls() {
  for (const box of pluginBoxes) box.checked = state.plugins.has(box.value)
  highlightBox.checked = state.highlight
  $('pg-plugin-count').textContent = `(${state.plugins.size})`
}

function setState({ source, plugins, highlight: hl }) {
  if (typeof source === 'string') src.value = source
  if (Array.isArray(plugins)) state.plugins = new Set(plugins.filter((p) => KNOWN.has(p)))
  if (typeof hl === 'boolean') state.highlight = hl
  syncControls()
  md = build()
  render()
}

function loadSample(id) {
  const sample = samples.find((s) => s.id === id)
  if (!sample) return false
  sampleSelect.value = id
  setState({ source: sample.source, plugins: sample.plugins })
  return true
}

let draftTimer = 0
function writeDraft() {
  clearTimeout(draftTimer)
  try {
    localStorage.setItem(DRAFT, JSON.stringify({ s: src.value, p: [...state.plugins], h: state.highlight, x: sampleSelect.value }))
  } catch {
    // Storage blocked: nothing to keep.
  }
}
function saveDraft() {
  clearTimeout(draftTimer)
  draftTimer = setTimeout(writeDraft, 300)
  // Once edited, a shared link or sample in the hash is stale: drop it so
  // that a reload restores the draft instead.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search)
}
addEventListener('pagehide', () => draftTimer && writeDraft())

// --- Sharing: deflate-raw + base64url in the hash ------------------------------

const toB64 = (bytes) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())

async function encode() {
  const json = JSON.stringify({ s: src.value, p: [...state.plugins], h: state.highlight })
  return `v1=${toB64(await pipe(new TextEncoder().encode(json), new CompressionStream('deflate-raw')))}`
}

async function decode(hash) {
  const bytes = await pipe(fromB64(hash.slice(3)), new DecompressionStream('deflate-raw'))
  const data = JSON.parse(new TextDecoder().decode(bytes))
  if (typeof data?.s !== 'string') throw new Error('no source in the link')
  return { source: data.s, plugins: Array.isArray(data.p) ? data.p : [], highlight: data.h !== false }
}

async function fromHash() {
  const hash = location.hash.slice(1)
  if (hash.startsWith('v1=')) {
    try {
      setState(await decode(hash))
      sampleSelect.value = ''
      status.textContent = 'Loaded from the link'
      return true
    } catch (e) {
      status.textContent = `This link could not be read (${e.message}).`
    }
  } else if (hash.startsWith('sample=')) {
    return loadSample(decodeURIComponent(hash.slice(7)))
  }
  return false
}

$('pg-share').addEventListener('click', async () => {
  history.replaceState(null, '', `#${await encode()}`)
  try {
    await navigator.clipboard.writeText(location.href)
    status.textContent = 'Link copied'
  } catch {
    status.textContent = 'Link ready in the address bar'
  }
})

addEventListener('hashchange', fromHash)

// --- Controls ---------------------------------------------------------------

src.addEventListener('input', () => {
  status.textContent = ''
  schedule()
  saveDraft()
})

sampleSelect.addEventListener('change', () => {
  loadSample(sampleSelect.value)
  saveDraft()
})

for (const box of [...pluginBoxes, highlightBox]) {
  box.addEventListener('change', () => {
    setState({ plugins: pluginBoxes.filter((b) => b.checked).map((b) => b.value), highlight: highlightBox.checked })
    saveDraft()
  })
}

// The plugin popover opens under its button (fixed position, kept on screen).
const pop = $('pg-plugins')
const popButton = $('pg-plugins-btn')
pop.addEventListener('beforetoggle', (e) => {
  if (e.newState !== 'open') return
  const r = popButton.getBoundingClientRect()
  pop.style.top = `${r.bottom + 6}px`
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - Math.min(400, innerWidth - 16) - 8))}px`
})

// Tabs (WAI-ARIA tabs pattern, automatic activation).
function selectTab(tab, focus = false) {
  for (const t of tabs) {
    const on = t === tab
    t.setAttribute('aria-selected', String(on))
    t.tabIndex = on ? 0 : -1
    $(t.getAttribute('aria-controls')).hidden = !on
  }
  state.tab = tab.id.slice(4)
  scrollLeader = src
  if (focus) tab.focus()
  render()
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab))
  tab.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(tab)
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    selectTab(tabs[(next + tabs.length) % tabs.length], true)
  })
}

// --- Start: link, then draft, then the welcome text (already in the page) ----

if (!(await fromHash())) {
  let draft = null
  try {
    draft = JSON.parse(localStorage.getItem(DRAFT) ?? 'null')
  } catch {
    draft = null
  }
  if (draft && typeof draft.s === 'string') {
    sampleSelect.value = samples.some((s) => s.id === draft.x) ? draft.x : ''
    setState({ source: draft.s, plugins: draft.p, highlight: draft.h !== false })
  } else {
    setState({ plugins: samples[0].plugins })
  }
}

// Offline: cache the playground and its assets.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Not fatal: the playground works online without it.
  })
}

// Demo application controls. The core and framework components keep their API.
const editor = document.querySelector('main.pg')
const historyStack = [src.value]
let historyIndex = 0
const undo = $('pg-undo'), redo = $('pg-redo')
function syncHistory() {
  undo.disabled = historyIndex === 0
  redo.disabled = historyIndex === historyStack.length - 1
}
function checkpoint() {
  if (src.value === historyStack[historyIndex]) return
  historyStack.splice(historyIndex + 1)
  historyStack.push(src.value)
  if (historyStack.length > 100) historyStack.shift()
  historyIndex = historyStack.length - 1
  syncHistory()
}
function moveHistory(delta) {
  const next = historyIndex + delta
  if (next < 0 || next >= historyStack.length) return
  historyIndex = next
  src.value = historyStack[next]
  render(); saveDraft(); syncHistory(); src.focus()
}
undo.addEventListener('click', () => moveHistory(-1))
redo.addEventListener('click', () => moveHistory(1))
src.addEventListener('input', checkpoint)
sampleSelect.addEventListener('change', checkpoint)
addEventListener('hashchange', () => setTimeout(checkpoint, 0))
syncHistory()
function mode(value) {
  editor.dataset.mode = value
  document.querySelector('.pg-left').hidden = value === 'read'
  document.querySelector('.pg-right').hidden = value === 'write'
  document.querySelector('.editor-ribbon').hidden = value === 'read'
  for (const button of document.querySelectorAll('button[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === value))
  if (value === 'read') selectTab($('tab-preview'))
  if (value === 'split') { scrollLeader = src; scheduleScrollSync() }
}
for (const button of document.querySelectorAll('button[data-mode]')) button.addEventListener('click', () => mode(button.dataset.mode))
function applyCommand(id) {
  const command = COMMANDS.find(c => c.id === id)
  if (!command) return
  checkpoint()
  if (command.plugin) { state.plugins.add(command.plugin); syncControls(); md = build() }
  const edit = insertCommand(src.value, src.selectionStart, src.selectionEnd, command)
  src.value = edit.value
  src.focus()
  src.setSelectionRange(edit.start, edit.end)
  sampleSelect.value = ''
  checkpoint(); render(); saveDraft()
  status.textContent = command.label.replace(/ \(.*\)/, '') + ' inserito'
}
for (const button of document.querySelectorAll('[data-command]')) {
  button.addEventListener('mousedown', e => e.preventDefault())
  button.addEventListener('click', () => applyCommand(button.dataset.command))
}
src.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return
  const key = e.key.toLowerCase()
  if (key === 'b' || key === 'i') { e.preventDefault(); applyCommand(key === 'b' ? 'bold' : 'italic') }
  if (key === 'z' || key === 'y') { e.preventDefault(); moveHistory(key === 'y' || e.shiftKey ? 1 : -1) }
})

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.append(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
async function exportDocument(title) {
  const article = document.createElement('article')
  article.className = 'md'
  // Mount offscreen so diagram layout and computed theme tokens work.
  const staging = document.createElement('div')
  staging.className = 'editor-export-stage'
  staging.style.colorScheme = 'light'
  staging.append(article); document.body.append(staging)
  try {
    md.renderTo(article, src.value)
    if (state.plugins.has('math') && article.querySelector('.math')) await typeset(article)
    await diagramQueue.catch(() => {})
    if (article.querySelector('pre.mermaid')) await renderMermaid(article, { load: loadMermaid, watch: false })
    const themeURL = document.querySelector('link[href*="/assets/theme.css"]').href
    const response = await fetch(themeURL)
    if (!response.ok) throw new Error('Stili non disponibili. Riprova con una connessione attiva.')
    const css = await response.text()
    const mathURL = new URL(document.querySelector('[data-katex-base]').dataset.katexBase + 'katex.min.css', location.href).href
    const content = new XMLSerializer().serializeToString(article)
    return '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>' + escape(title) + '</title><link rel="stylesheet" href="' + escape(mathURL) + '"><style>' + css + '\nbody{margin:0 auto;padding:32px;max-width:820px;color:#242424;background:white;font:16px/1.6 "Segoe UI",sans-serif}img,svg{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1,h2,h3{break-after:avoid}tr,figure{break-inside:avoid}@page{margin:18mm}@media print{body{padding:0;max-width:none}}</style></head><body>' + content + '</body></html>'
  } finally { staging.remove() }
}
for (const button of document.querySelectorAll('[data-export]')) button.addEventListener('click', async () => {
  const format = button.dataset.export
  const title = $('pg-name').value.trim() || 'Documento'
  const name = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 100)
  if (format === 'md') { download(new Blob([src.value], { type: 'text/markdown;charset=utf-8' }), name + '.md'); status.textContent = 'Markdown esportato'; return }
  const buttons = [...document.querySelectorAll('[data-export]')]
  buttons.forEach(b => b.disabled = true)
  status.textContent = 'Preparazione del documento…'
  try {
    const html = await exportDocument(title)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    if (format === 'html') { download(blob, name + '.html'); status.textContent = 'HTML esportato'; return }
    const frame = document.createElement('iframe')
    frame.className = 'editor-print-frame'
    frame.title = 'Documento da stampare'
    frame.setAttribute('sandbox', 'allow-same-origin allow-modals')
    const url = URL.createObjectURL(blob)
    frame.src = url
    frame.onload = async () => {
      await Promise.race([
        Promise.all([frame.contentDocument.fonts.ready, ...[...frame.contentDocument.images].map(img => img.decode().catch(() => {}))]),
        new Promise(resolve => setTimeout(resolve, 5000)),
      ])
      status.textContent = 'Scegli «Salva come PDF» nella finestra di stampa.'
      frame.contentWindow.focus(); frame.contentWindow.print()
      setTimeout(() => { frame.remove(); URL.revokeObjectURL(url) }, 60000)
    }
    document.body.append(frame)
  } catch (error) { status.textContent = 'Esportazione non riuscita: ' + error.message }
  finally { buttons.forEach(b => b.disabled = false) }
})
