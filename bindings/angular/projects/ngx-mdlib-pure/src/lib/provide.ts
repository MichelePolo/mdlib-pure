import { isPlatformBrowser, isPlatformServer } from '@angular/common'
import { type EnvironmentProviders, inject, makeEnvironmentProviders, PLATFORM_ID, provideAppInitializer, provideEnvironmentInitializer } from '@angular/core'
import type { Options } from 'mdlib-pure'
import { defineElements, type ElementsOptions } from 'mdlib-pure/element'

/**
 * Options of `provideMdlibPure()`: mdlib-pure's `defineElements()` options.
 *
 * - `loaders`: KaTeX and Mermaid, loaded only when a document has math or a
 *   diagram: `{ mermaid: () => import('mermaid'), katex: () =>
 *   import('katex/contrib/auto-render').then((m) => m.default), katexStylesheet: '/katex/katex.min.css' }`.
 * - `configs`: named `createMarkdown()` options (`highlight`, `allowUrl`,
 *   `attributes`, `classes`, `html` + `sanitize`…), selected with the `config`
 *   input of the components and the `config` argument of `MarkdownService`.
 */
export type MdlibPureOptions = ElementsOptions

/** Set by the Angular CLI's builders: `false` in browser bundles, `true` in server bundles. */
declare const ngServerMode: boolean | undefined

/** Options already registered on the server (each request bootstraps the app again). */
const registered = new WeakSet<MdlibPureOptions>()

/**
 * Server: register the named configs for `MarkdownService`, each with the
 * full entity table of `mdlib-pure/entities` (outside the browser, the
 * default decoder only knows `amp lt gt quot apos nbsp`). The configs only:
 * no loaders, and no element is defined (Node has no `customElements`).
 */
async function registerOnServer(options: MdlibPureOptions): Promise<void> {
  if (registered.has(options)) return
  const { decodeEntity } = await import('mdlib-pure/entities')
  const configs: Record<string, Omit<Options, 'plugins'>> = { '': { decodeEntity } }
  for (const [name, config] of Object.entries(options.configs ?? {})) configs[name] = { decodeEntity, ...config }
  if (typeof customElements === 'undefined') defineElements({ configs })
  registered.add(options)
}

/**
 * Set up mdlib-pure for the app, in `app.config.ts`:
 *
 * ```ts
 * providers: [provideMdlibPure({ loaders: { mermaid: () => import('mermaid') } })]
 * ```
 *
 * In the browser it defines `<mdlib-markdown>` and `<mdlib-editor>` with your
 * loaders and configs, before the app renders or hydrates. On the server it
 * defines no element; it registers your configs for `MarkdownService`, with
 * the full entity table (loaded only by the server bundle).
 */
export function provideMdlibPure(options: MdlibPureOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideEnvironmentInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) defineElements(options)
    }),
    provideAppInitializer(() => {
      // In browser bundles ngServerMode is `false`: the branch, and the entity
      // table with it, is removed. Other toolchains: PLATFORM_ID decides.
      if ((typeof ngServerMode === 'undefined' || ngServerMode) && isPlatformServer(inject(PLATFORM_ID))) return registerOnServer(options)
      return undefined
    }),
  ])
}
