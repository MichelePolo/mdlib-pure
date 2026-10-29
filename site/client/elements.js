// The Web Components sample: defines <mdlib-markdown> and <mdlib-editor> from
// src/element.ts, with this site's own copies of KaTeX and Mermaid as loaders
// (no CDN). Each is fetched only when a document on the page needs it.
import { defineElements } from '../../src/element.ts'

/** A file of the site's assets/ (this script lives in assets/js/). */
const asset = (path) => new URL(`../${path}`, import.meta.url).href

const script = (src) =>
  new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = () => reject(new Error(`could not load ${src}`))
    document.head.append(s)
  })

// KaTeX auto-render is a classic script: reuse it if the page already has it.
let katex
const loadKatex = () =>
  (katex ??= window.renderMathInElement ? Promise.resolve() : script(asset('katex/katex.min.js')).then(() => script(asset('katex/contrib/auto-render.min.js')))).then(
    () => window.renderMathInElement,
  )

defineElements({
  loaders: {
    katex: loadKatex,
    katexStylesheet: asset('katex/katex.min.css'),
    mermaid: () => import(asset('mermaid/mermaid.js')),
  },
})

// Show the editor's debounced `input` events, as an app would receive them.
const status = document.getElementById('elements-events')
let events = 0
for (const editor of document.querySelectorAll('#elements mdlib-editor')) {
  editor.addEventListener('input', (e) => {
    events += 1
    status.textContent = `${events} ${events === 1 ? 'event' : 'events'}, the last with ${e.target.value.length} characters`
  })
}
