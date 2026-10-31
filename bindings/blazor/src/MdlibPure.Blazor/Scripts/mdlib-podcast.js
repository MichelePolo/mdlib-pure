import { mountPodcastEditor } from '../../../../../templates/podcast/editor.js'
import { podcastMarkup } from '../../../../../templates/podcast/ui.js'

const sheets = new Map()
function stylesheet(url) {
  if (!sheets.has(url)) sheets.set(url, fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`Cannot load podcast stylesheet: ${response.status}`)
    const sheet = new CSSStyleSheet()
    await sheet.replace(await response.text())
    return sheet
  }))
  return sheets.get(url)
}
function parse(value, fallback) {
  try { return JSON.parse(value) ?? fallback } catch { return fallback }
}

/** Package-local element: JSON state is the form value and the input event value. */
export function definePodcastEditor({ styles = [] } = {}) {
  if (customElements.get('mdlib-podcast-editor')) return
  class PodcastEditor extends HTMLElement {
    static formAssociated = true
    static observedAttributes = ['value', 'participants', 'view', 'label', 'disabled']
    #root = this.attachShadow({ mode: 'open' })
    #internals = this.attachInternals?.()
    #editor
    #value = '{}'
    #sent = []
    #timer
    #generation = 0
    #disabled = false

    constructor() {
      super()
      // Only the element's debounced input/change events reach Blazor.
      this.#root.addEventListener('input', (event) => event.stopPropagation())
      this.#root.addEventListener('change', (event) => event.stopPropagation())
      this.#root.addEventListener('focusout', () => this.#flush())
      if (Object.hasOwn(this, 'value')) {
        const value = this.value
        delete this.value
        this.value = value
      }
    }
    get value() { return this.#editor ? JSON.stringify(this.#editor.getState()) : this.#value }
    set value(value) {
      const next = JSON.stringify(parse(String(value ?? '{}'), {}))
      if (next === this.value) return
      this.#value = next
      this.#sent = []
      this.#editor?.setState(parse(next, {}))
      this.#sync(next !== this.value)
    }
    async connectedCallback() {
      if (this.#editor) return
      const generation = ++this.#generation
      const stylesheets = await Promise.all(styles.map(stylesheet))
      if (!this.isConnected || generation !== this.#generation) return
      this.#root.adoptedStyleSheets = stylesheets
      const template = document.createElement('template')
      template.innerHTML = podcastMarkup() // check:allow-innerHTML source-controlled static UI only; user data is assigned by DOM APIs below
      this.#root.replaceChildren(template.content.cloneNode(true))
      const host = this.#root.querySelector('.podcast')
      host.setAttribute('part', 'editor')
      host.querySelector('.podcast-eyebrow').textContent = 'EDITOR SCALETTA'
      host.querySelector('.podcast-subtitle').textContent = 'Una traccia comune. Tutti i documenti dell’episodio.'
      this.#editor = mountPodcastEditor(host, {
        value: parse(this.#value, {}),
        participants: parse(this.getAttribute('participants'), undefined),
        onChange: () => this.#sync(true),
      })
      this.#configure()
      this.#sync(this.#value !== this.value)
    }
    disconnectedCallback() {
      // Reparenting during enhanced navigation need not discard the instance.
      queueMicrotask(() => {
        if (this.isConnected) return
        this.#generation++
        this.#value = this.value
        clearTimeout(this.#timer)
        this.#timer = undefined
        this.#editor?.destroy()
        this.#editor = undefined
      })
    }
    attributeChangedCallback(name, old, value) {
      if (old === value) return
      if (name === 'value') {
        const next = JSON.stringify(parse(value, {}))
        if (this.#root.activeElement && this.#sent.includes(next)) return
        this.value = next
      } else {
        if (name === 'participants') this.#editor?.setParticipants(parse(value, undefined))
        this.#configure()
      }
    }
    formDisabledCallback(disabled) { this.#disabled = disabled; this.#configure(); this.#sync(false) }
    formResetCallback() { this.value = this.getAttribute('value') ?? '{}' }
    formStateRestoreCallback(state) { if (typeof state === 'string') this.value = state }
    #configure() {
      if (!this.style.display) this.style.display = 'block'
      if (!this.#editor) return
      this.#editor.setView(this.getAttribute('view') ?? 'split')
      this.#root.querySelector('textarea').setAttribute('aria-label', this.getAttribute('label') ?? 'Sorgente Markdown')
      this.#root.querySelector('.podcast').inert = this.#disabled || this.hasAttribute('disabled')
    }
    #sync(notify) {
      this.#internals?.setFormValue?.(this.#disabled || this.hasAttribute('disabled') ? null : this.value)
      if (!notify) return
      clearTimeout(this.#timer)
      const delay = Number(this.getAttribute('delay') ?? 200)
      this.#timer = setTimeout(() => this.#flush(), Number.isFinite(delay) ? Math.max(0, delay) : 200)
    }
    #flush() {
      if (this.#timer === undefined) return
      clearTimeout(this.#timer)
      this.#timer = undefined
      this.#value = this.value
      this.#sent.push(this.#value)
      if (this.#sent.length > 32) this.#sent.shift()
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
      this.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }
  customElements.define('mdlib-podcast-editor', PodcastEditor)
}
