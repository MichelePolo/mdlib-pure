// Playground: the demo editor, extended. Markdown on the left, output on the
// right (Preview / HTML / AST), samples, plugin toggles, sharing through the
// URL hash, a local draft, KaTeX on demand, offline through a service worker.
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
const KNOWN = new Set(PLUGINS.map((p) => p.id))

const state = { plugins: new Set(['gfm']), highlight: true, tab: 'preview' }
let md = build()

function build() {
  return createMarkdown({ plugins: pluginsFor([...state.plugins]), highlight: state.highlight ? highlight : undefined })
}

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

function typeset() {
  loadKatex()
    .then(() =>
      window.renderMathInElement(preview, {
        delimiters: [
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true },
        ],
        throwOnError: false,
      }),
    )
    .catch((e) => (status.textContent = `Math not typeset: ${e.message}`))
}

function render() {
  const text = src.value
  try {
    if (state.tab === 'preview') {
      md.renderTo(preview, text)
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
