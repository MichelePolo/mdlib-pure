// Web Components: <mdlib-markdown> (viewer) and <mdlib-editor> (editor with
// live preview). Framework-neutral: plain HTML, Blazor, Angular, CMS pages.
//
//   import { defineElements } from 'mdlib-pure/element'
//   defineElements({ loaders: { mermaid: () => import('mermaid') } })
//
//   <mdlib-markdown class="md" source="# Hello" plugins="gfm math"></mdlib-markdown>
//   <mdlib-editor value="# Hello" plugins="all"></mdlib-editor>
//
// Attributes (both): `plugins` = space-separated names or "all" (gfm headings
// math mermaid container deflist mark frontmatter); `config` = name of options
// registered with defineElements({ configs }) (functions such as `highlight`
// or `allowUrl`, and `html`, can only be set there, never from attributes).
// <mdlib-markdown>: `source`. <mdlib-editor>: `value`, `view` (split | write |
// preview), `delay` (ms before `input` is dispatched, default 200), `label`.
//
// <mdlib-editor> renders the preview on every keystroke, in the browser, and
// dispatches debounced `input` events (and `change` on blur) with
// `event.target.value`. Echoes of values it already sent (a server that
// re-renders the attribute late) are ignored, so typing is never overwritten.
// It is form-associated: with a `name`, its value is submitted with the form.
//
// Math is typeset with KaTeX and diagrams drawn with Mermaid only when a
// document uses them, through the loaders given to defineElements().

import { gfm } from './gfm/index.ts'
import { createMarkdown, type Markdown, type Options } from './index.ts'
import { container } from './plugins/container.ts'
import { deflist } from './plugins/deflist.ts'
import { frontmatter } from './plugins/frontmatter.ts'
import { headings } from './plugins/headings.ts'
import { mark } from './plugins/mark.ts'
import { math } from './plugins/math.ts'
import { type MermaidLike, mermaid, renderMermaid } from './plugins/mermaid.ts'
import type { Plugin } from './types.ts'

export interface ElementsOptions {
  loaders?: {
    /** Mermaid, e.g. `() => import('mermaid')`. */
    mermaid?: () => Promise<MermaidLike | { default: MermaidLike }>
    /** KaTeX auto-render's `renderMathInElement`, e.g. `() => import('katex/contrib/auto-render').then((m) => m.default)`. */
    katex?: () => Promise<(el: Element, options: object) => void>
    /** KaTeX stylesheet URL, added to the document once math appears. */
    katexStylesheet?: string
  }
  /** Named `createMarkdown` options, selected with the `config` attribute. */
  configs?: Record<string, Omit<Options, 'plugins'>>
}

/** Plugins by name, in the order they are applied (whatever the attribute order). */
const FACTORIES = new Map<string, () => Plugin[]>([
  ['gfm', () => gfm()],
  ['headings', () => [headings()]],
  ['math', () => [math()]],
  ['mermaid', () => [mermaid()]],
  ['container', () => [container()]],
  ['deflist', () => [deflist()]],
  ['mark', () => [mark()]],
  ['frontmatter', () => [frontmatter()]],
])

export const PLUGIN_NAMES: readonly string[] = [...FACTORIES.keys()]

const loaders: NonNullable<ElementsOptions['loaders']> = {}
const configs = new Map<string, Omit<Options, 'plugins'>>()
const instances = new Map<string, Markdown>()

/** The shared instance for a `plugins` attribute value and a config name. */
export function getMarkdown(plugins = '', config = ''): Markdown {
  const names = new Set(plugins.split(/\s+/).filter(Boolean))
  const all = names.has('all')
  const on = PLUGIN_NAMES.filter((n) => all || names.has(n))
  const key = `${on.join(' ')}|${config}`
  let md = instances.get(key)
  if (!md) {
    md = createMarkdown({ ...configs.get(config), plugins: on.flatMap((n) => FACTORIES.get(n)!()) })
    instances.set(key, md)
  }
  return md
}

// --- Math and diagrams after each render -------------------------------------------

let typeset: ((el: Element, options: object) => void) | undefined
let katexLoading: Promise<void> | undefined

const KATEX_OPTIONS = {
  delimiters: [
    { left: '\\(', right: '\\)', display: false },
    { left: '\\[', right: '\\]', display: true },
  ],
  throwOnError: false,
}

/** Typeset math now if KaTeX is loaded, else load it (once) and typeset then. */
function typesetMath(el: Element): void {
  if (!el.querySelector('.math') || !loaders.katex) return
  if (typeset) return typeset(el, KATEX_OPTIONS)
  katexLoading ??= loaders.katex().then(async (fn) => {
    typeset = fn
    if (loaders.katexStylesheet) await adoptStylesheet(loaders.katexStylesheet)
  })
  katexLoading.then(() => el.isConnected && typeset?.(el, KATEX_OPTIONS))
}

/**
 * Add a stylesheet through document.adoptedStyleSheets: it is not a DOM node,
 * so frameworks that morph the document (Blazor enhanced navigation, Turbo,
 * htmx) cannot remove it. Relative url()s (fonts) are made absolute, since a
 * constructed sheet resolves them against the document. Falls back to <link>.
 */
async function adoptStylesheet(href: string): Promise<void> {
  const url = new URL(href, document.baseURI)
  try {
    const css = await (await fetch(url)).text()
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css.replace(/url\((['"]?)(?![a-z]+:|\/)([^'")]+)\1\)/gi, (_, q: string, path: string) => `url(${q}${new URL(path, url)}${q})`))
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  } catch {
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url.href }))
  }
}

/** Connected elements, refreshed when loaders or configs are added later. */
const live = new Set<{ refresh(): void }>()

/** Per-element Mermaid state: rendered SVGs by source, so unchanged diagrams never flicker. */
interface Diagrams {
  cache: Map<string, SVGElement>
  scheme: string
  stop: () => void
  generation: number
}

const newDiagrams = (): Diagrams => ({ cache: new Map(), scheme: '', stop: () => {}, generation: 0 })

async function drawDiagrams(el: HTMLElement, d: Diagrams): Promise<void> {
  const generation = ++d.generation
  d.stop()
  d.stop = () => {}
  const nodes = [...el.querySelectorAll<HTMLElement>('pre.mermaid')]
  if (!nodes.length || !loaders.mermaid) return
  // Cached SVGs follow the colors of the scheme they were drawn in.
  const scheme = getComputedStyle(el).color
  if (scheme !== d.scheme) d.cache.clear()
  d.scheme = scheme
  const pending: Array<[HTMLElement, string]> = []
  for (const pre of nodes) {
    const source = pre.textContent ?? ''
    const svg = d.cache.get(source)
    if (svg) {
      const box = document.createElement('div')
      box.className = 'mermaid-diagram'
      box.append(svg.cloneNode(true))
      pre.replaceWith(box)
    } else {
      pending.push([pre, source])
    }
  }
  if (!pending.length) return
  const stop = await renderMermaid(el, { load: loaders.mermaid })
  if (generation !== d.generation) return stop() // a newer render replaced these nodes
  d.stop = stop
  for (const [pre, source] of pending) {
    const svg = pre.isConnected ? pre.querySelector('svg') : null
    if (svg) d.cache.set(source, svg.cloneNode(true) as SVGElement)
  }
}

// --- Elements --------------------------------------------------------------------

type Tool = [label: string, name: string, key: string, run: (ta: HTMLTextAreaElement) => void]

function wrap(ta: HTMLTextAreaElement, before: string, after = before, placeholder = 'text'): void {
  const { selectionStart: s, selectionEnd: e, value } = ta
  const text = value.slice(s, e) || placeholder
  ta.setRangeText(before + text + after, s, e)
  ta.setSelectionRange(s + before.length, s + before.length + text.length)
}

function prefixLines(ta: HTMLTextAreaElement, prefix: (i: number) => string): void {
  const { selectionStart: s, selectionEnd: e, value } = ta
  const start = value.lastIndexOf('\n', s - 1) + 1
  const text = value
    .slice(start, e)
    .split('\n')
    .map((line, i) => prefix(i) + line)
    .join('\n')
  ta.setRangeText(text, start, e, 'select')
}

const TOOLS: Tool[] = [
  ['B', 'Bold', 'b', (ta) => wrap(ta, '**')],
  ['I', 'Italic', 'i', (ta) => wrap(ta, '_')],
  ['H', 'Heading', '', (ta) => prefixLines(ta, () => '## ')],
  ['Link', 'Link', 'k', (ta) => wrap(ta, '[', '](https://)', 'link text')],
  ['•', 'Bulleted list', '', (ta) => prefixLines(ta, () => '- ')],
  ['1.', 'Numbered list', '', (ta) => prefixLines(ta, (i) => `${i + 1}. `)],
  ['❝', 'Quote', '', (ta) => prefixLines(ta, () => '> ')],
  ['</>', 'Code', '', (ta) => (ta.value.slice(ta.selectionStart, ta.selectionEnd).includes('\n') ? wrap(ta, '```\n', '\n```', 'code') : wrap(ta, '`', '`', 'code'))],
]

const VIEWS = ['split', 'write', 'preview'] as const

function button(label: string, name: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.title = name
  b.setAttribute('aria-label', name)
  return b
}

function defineClasses(): void {
  class MdlibMarkdown extends HTMLElement {
    static observedAttributes = ['source', 'plugins', 'config']
    #diagrams = newDiagrams()
    // A framework morphing the page may empty the element: render again.
    #observer = new MutationObserver(() => {
      if (!this.firstChild && this.getAttribute('source')) this.refresh()
    })

    connectedCallback(): void {
      live.add(this)
      this.#observer.observe(this, { childList: true })
      this.refresh()
    }

    attributeChangedCallback(): void {
      if (this.isConnected) this.refresh()
    }

    disconnectedCallback(): void {
      live.delete(this)
      this.#observer.disconnect()
      this.#diagrams.stop()
    }

    /** Render again (e.g. after loaders or configs were added). */
    refresh(): void {
      getMarkdown(this.getAttribute('plugins') ?? '', this.getAttribute('config') ?? '').renderTo(this, this.getAttribute('source') ?? '')
      this.#observer.takeRecords() // our own changes are not external ones
      typesetMath(this)
      void drawDiagrams(this, this.#diagrams)
    }
  }

  class MdlibEditor extends HTMLElement {
    static observedAttributes = ['value', 'plugins', 'config', 'view', 'label']
    static formAssociated = true
    #internals = this.attachInternals()
    #input = document.createElement('textarea')
    #preview = document.createElement('div')
    #toolbar = document.createElement('div')
    #panes = document.createElement('div')
    #diagrams = newDiagrams()
    // A framework morphing the page may remove our parts: put them back
    // (the text area keeps the user's text).
    #observer = new MutationObserver(() => {
      if (this.#toolbar.parentNode !== this || this.#panes.parentNode !== this) this.#mount()
    })
    /** Values already sent to listeners: if one comes back as an attribute, it is an echo. */
    #sent: string[] = []
    #timer = 0
    #frame = 0
    #drawTimer = 0

    constructor() {
      super()
      const input = this.#input
      input.className = 'mdlib-editor-input'
      input.spellcheck = false
      this.#preview.className = 'mdlib-editor-preview md'
      this.#preview.setAttribute('role', 'region')
      this.#preview.setAttribute('aria-label', 'Preview')
      this.#toolbar.className = 'mdlib-editor-toolbar'
      this.#toolbar.setAttribute('role', 'toolbar')
      this.#toolbar.setAttribute('aria-label', 'Formatting')

      for (const [label, name, key, run] of TOOLS) {
        const b = button(label, key ? `${name} (Ctrl+${key.toUpperCase()})` : name)
        b.addEventListener('click', () => this.#apply(run))
        this.#toolbar.append(b)
      }
      const views = document.createElement('span')
      views.className = 'mdlib-editor-views'
      for (const view of VIEWS) {
        const b = button(view[0].toUpperCase() + view.slice(1), `${view[0].toUpperCase() + view.slice(1)} view`)
        b.dataset.view = view
        b.addEventListener('click', () => this.setAttribute('view', view))
        views.append(b)
      }
      this.#toolbar.append(views)

      // The textarea's own events must not escape: listeners of the element
      // (e.g. Blazor's @bind) would get every keystroke. The element sends
      // its own debounced `input` and its `change`.
      input.addEventListener('input', (e) => {
        e.stopPropagation()
        this.#changed()
      })
      input.addEventListener('change', (e) => e.stopPropagation())
      input.addEventListener('blur', () => this.#flush(true))
      input.addEventListener('keydown', (e) => {
        if (!(e.ctrlKey || e.metaKey) || e.altKey) return
        const tool = TOOLS.find((t) => t[2] && t[2] === e.key.toLowerCase())
        if (tool) {
          e.preventDefault()
          this.#apply(tool[3])
        }
      })
      // Keep the preview roughly at the same place as the source.
      input.addEventListener('scroll', () => {
        const range = input.scrollHeight - input.clientHeight
        const p = this.#preview
        p.scrollTop = range > 0 ? (input.scrollTop / range) * (p.scrollHeight - p.clientHeight) : 0
      })
    }

    get value(): string {
      return this.#input.value
    }

    set value(v: string) {
      if (v === this.#input.value) return
      this.#input.value = v
      this.#sent = []
      this.#internals.setFormValue(v)
      this.#render()
    }

    connectedCallback(): void {
      if (!this.#panes.firstChild) {
        this.#panes.className = 'mdlib-editor-panes'
        this.#panes.append(this.#input, this.#preview)
        this.#input.value = this.getAttribute('value') ?? ''
        this.#internals.setFormValue(this.#input.value)
        this.#syncView()
        this.#input.setAttribute('aria-label', this.getAttribute('label') ?? 'Markdown')
      }
      this.#mount()
      live.add(this)
      this.#observer.observe(this, { childList: true })
      this.#render()
    }

    disconnectedCallback(): void {
      live.delete(this)
      this.#observer.disconnect()
      this.#diagrams.stop()
    }

    #mount(): void {
      if (this.#toolbar.parentNode === this && this.#panes.parentNode === this && this.childNodes.length === 2) return
      this.replaceChildren(this.#toolbar, this.#panes)
      this.#observer.takeRecords()
    }

    /** Render the preview again (e.g. after loaders or configs were added). */
    refresh(): void {
      this.#render()
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      if (name === 'value') {
        const v = value ?? ''
        // While the user types, a value we already sent is an echo (possibly a
        // stale one): never overwrite typing. Otherwise it is a deliberate set
        // (e.g. a Reset button, which also takes the focus away).
        if (v === this.#input.value) return
        if (document.activeElement === this.#input && this.#sent.includes(v)) return
        this.value = v
      } else if (name === 'view') {
        this.#syncView()
      } else if (name === 'label') {
        this.#input.setAttribute('aria-label', value ?? 'Markdown')
      } else if (this.isConnected) {
        this.#render()
      }
    }

    #syncView(): void {
      const view = VIEWS.find((v) => v === this.getAttribute('view')) ?? 'split'
      for (const b of this.#toolbar.querySelectorAll<HTMLButtonElement>('[data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view))
    }

    #apply(run: (ta: HTMLTextAreaElement) => void): void {
      this.#input.focus()
      run(this.#input)
      this.#changed()
    }

    #changed(): void {
      this.#internals.setFormValue(this.#input.value)
      // Render on the next frame: several keystrokes in one frame render once.
      cancelAnimationFrame(this.#frame)
      this.#frame = requestAnimationFrame(() => this.#render())
      clearTimeout(this.#timer)
      this.#timer = window.setTimeout(() => this.#flush(false), Number(this.getAttribute('delay') ?? 200))
    }

    /** Tell listeners: `input` (debounced) or, on blur, a pending `input` then `change`. */
    #flush(blur: boolean): void {
      const pending = this.#timer !== 0
      clearTimeout(this.#timer)
      this.#timer = 0
      if (pending || !blur) {
        this.#sent.push(this.#input.value)
        if (this.#sent.length > 32) this.#sent.shift()
        this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      }
      if (blur) this.dispatchEvent(new Event('change', { bubbles: true }))
    }

    #render(): void {
      const preview = this.#preview
      getMarkdown(this.getAttribute('plugins') ?? '', this.getAttribute('config') ?? '').renderTo(preview, this.#input.value)
      typesetMath(preview)
      // Diagrams: cached ones are restored at once; new ones after a pause.
      clearTimeout(this.#drawTimer)
      const cached = [...preview.querySelectorAll('pre.mermaid')].every((p) => this.#diagrams.cache.has(p.textContent ?? ''))
      if (cached) void drawDiagrams(preview, this.#diagrams)
      else this.#drawTimer = window.setTimeout(() => drawDiagrams(preview, this.#diagrams), 300)
    }
  }

  if (!customElements.get('mdlib-markdown')) customElements.define('mdlib-markdown', MdlibMarkdown)
  if (!customElements.get('mdlib-editor')) customElements.define('mdlib-editor', MdlibEditor)
}

/**
 * Register the loaders and named configs, and define the elements (once).
 * Safe to call again to add loaders or configs. Classes are created here,
 * not at import time, so the module can be imported where there is no DOM.
 */
export function defineElements(options: ElementsOptions = {}): void {
  Object.assign(loaders, options.loaders)
  for (const [name, cfg] of Object.entries(options.configs ?? {})) {
    configs.set(name, cfg)
    for (const key of [...instances.keys()]) if (key.endsWith(`|${name}`)) instances.delete(key)
  }
  if (typeof customElements !== 'undefined') defineClasses()
  // Elements defined before these loaders/configs existed render again now.
  for (const el of live) el.refresh()
}
