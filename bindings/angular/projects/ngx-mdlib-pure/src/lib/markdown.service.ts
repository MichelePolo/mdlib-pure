import { Injectable } from '@angular/core'
import type { Markdown, Root } from 'mdlib-pure'
import { getMarkdown } from 'mdlib-pure/element'
import { type TocEntry, toc } from 'mdlib-pure/headings'
import { type MarkdownPlugins, pluginsAttribute } from './plugins'

/**
 * mdlib-pure from TypeScript: the AST, the table of contents, HTML. Works in
 * the browser and on the server (synchronously, no DOM needed). Uses the same
 * shared instances as the elements, so a `config` registered with
 * `provideMdlibPure({ configs })` applies here too.
 *
 * ```ts
 * readonly #markdown = inject(MarkdownService)
 * readonly outline = computed(() => this.#markdown.toc(this.body(), 'all'))
 * ```
 */
@Injectable({ providedIn: 'root' })
export class MarkdownService {
  /** The shared `Markdown` instance behind a plugins/config combination (`parse`, `render`, `renderTo`, `toVNodes`). */
  instance(plugins?: MarkdownPlugins | null, config?: string | null): Markdown {
    return getMarkdown(pluginsAttribute(plugins) ?? '', config ?? '')
  }

  /** Markdown → mdast-style AST. Node types and properties: mdlib-pure's `docs/api.md`. */
  parse(source: string, plugins?: MarkdownPlugins | null, config?: string | null): Root {
    return this.instance(plugins, config).parse(source ?? '')
  }

  /** Headings with their ids, `[{ depth, id, text }]`. The `headings` plugin is always on here, so ids match a viewer with it. */
  toc(source: string, plugins?: MarkdownPlugins | null, config?: string | null): TocEntry[] {
    const md = getMarkdown(`${pluginsAttribute(plugins) ?? ''} headings`, config ?? '')
    return toc(md.parse(source ?? ''))
  }

  /**
   * Markdown → HTML string: the viewer's output before KaTeX and Mermaid run
   * (math stays `\(…\)`, diagrams `<pre class="mermaid">`). Safe to show
   * with the default options; never trust HTML produced by a config with
   * `html: true` and no `sanitize`.
   */
  render(source: string, plugins?: MarkdownPlugins | null, config?: string | null): string {
    return this.instance(plugins, config).render(source ?? '')
  }
}
