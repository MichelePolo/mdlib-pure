// MdlibPure.Blazor JS initializer. Blazor loads `<PackageId>.lib.module.js` of
// every referenced library by itself: apps need no <script> tag.
//
// It defines <mdlib-markdown> and <mdlib-editor> (dist/mdlib-element.js), with
// KaTeX and Mermaid loaded from this package's own assets, only when a
// document has math or diagrams. The browser upgrades the elements wherever
// they appear (static HTML, enhanced navigation, interactive renders), so the
// same code serves every render mode.
//
// Styles: theme.css and editor.css are adopted (document.adoptedStyleSheets)
// unless the app already has them (detected from their effect, however they
// were included), or opts out with <meta name="mdlib-pure-styles" content="none">.
// Adopted sheets are not DOM nodes, so enhanced navigation, which rewrites
// <head> to match each new page, cannot remove them. KaTeX's stylesheet is
// adopted the same way when math first appears.
//
// Elements are defined in afterWebStarted/afterStarted: by then every JS
// initializer's beforeWebStart/beforeStart has run, so an app can register
// named configs first (see the README, "Named configs"). If the app's call to
// defineElements() already defined them, the elements on the page are
// rendered again once KaTeX and Mermaid can be loaded.

const asset = (path) => new URL(`./dist/${path}`, import.meta.url).href

/** @type {Promise<CSSStyleSheet> | undefined} */
let katexSheet
/** @type {Promise<any> | undefined} */
let prepared
/** @type {Promise<void> | undefined} */
let started

async function sheet(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`MdlibPure.Blazor: cannot load ${url} (${response.status})`)
  // Relative url()s (KaTeX's fonts) would resolve against the document, even
  // with the constructor's baseURL option: make them absolute.
  const css = (await response.text()).replace(/url\((['"]?)(?![a-z][a-z0-9+.-]*:|\/|#)([^'")]+)\1\)/gi, (_, q, path) => `url(${q}${new URL(path, url).href}${q})`)
  const s = new CSSStyleSheet()
  await s.replace(css)
  return s
}

function adopt(sheets) {
  const missing = sheets.filter((s) => s && !document.adoptedStyleSheets.includes(s))
  if (missing.length) document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...missing]
}

/**
 * Which of theme.css / editor.css the page lacks, judged by the effect of one
 * of their rules (not by the --md-* tokens: apps set those to customize the
 * theme this module adds).
 */
function missingStyles() {
  if (document.querySelector('meta[name="mdlib-pure-styles"][content="none"]')) return []
  const probe = document.createElement('div')
  probe.className = 'md'
  probe.style.cssText = 'position:absolute;visibility:hidden;contain:strict'
  const container = document.createElement('div')
  container.className = 'md-container'
  // Created before the elements are defined: a plain element, styled by tag name.
  const editor = document.createElement('mdlib-editor')
  probe.append(container, editor)
  ;(document.body ?? document.documentElement).append(probe)
  const missing = []
  if (!getComputedStyle(container).getPropertyValue('--md-container').trim()) missing.push('theme.css')
  if (getComputedStyle(editor).display !== 'grid') missing.push('editor.css')
  probe.remove()
  return missing
}

/** Load the element module, and adopt the stylesheets the page lacks as soon as they arrive. */
function prepare() {
  // A stylesheet that fails to load is reported, not fatal: the elements still work.
  const report = (error) => (console.error(error), null)
  prepared ??= Promise.all([
    import(asset('mdlib-element.js')),
    ...missingStyles().map((f) => sheet(asset(f)).then((s) => adopt([s]), report)),
  ]).then(([mod]) => mod)
  return prepared
}

async function loadKatex() {
  katexSheet ??= sheet(asset('katex/katex.min.css'))
  const [mod, css] = await Promise.all([import(asset('katex/auto-render.js')), katexSheet])
  adopt([css])
  return mod.default
}

/** Render an element again (any observed attribute change does). */
function refresh(el) {
  const plugins = el.getAttribute('plugins')
  if (plugins === null) {
    el.setAttribute('plugins', '')
    el.removeAttribute('plugins')
  } else {
    el.setAttribute('plugins', plugins)
  }
}

function start() {
  started ??= prepare().then(({ defineElements }) => {
    const early = customElements.get('mdlib-markdown') !== undefined
    defineElements({
      loaders: {
        mermaid: () => import(asset('mermaid/mermaid.js')),
        katex: loadKatex,
      },
    })
    // Defined earlier by the app (registering configs): math and diagrams were skipped.
    if (early) for (const el of document.querySelectorAll('mdlib-markdown, mdlib-editor')) refresh(el)
  })
  return started
}

// Blazor Web App (blazor.web.js), in every render mode including Static SSR.
export function beforeWebStart() {
  void prepare()
}

export function afterWebStarted() {
  return start()
}

// Standalone Blazor WebAssembly (blazor.webassembly.js) and Blazor Server (blazor.server.js).
export function beforeStart() {
  void prepare()
}

export function afterStarted() {
  return start()
}
