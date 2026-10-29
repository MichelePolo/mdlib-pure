import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { type MarkdownPlugins, pluginsAttribute } from './plugins'

/** What the wrapped custom elements add to HTMLElement. */
export interface MdlibElement extends HTMLElement {
  /** Render again (e.g. after a config changed). */
  refresh?(): void
}

/**
 * Markdown viewer: the `<mdlib-markdown>` Web Component, as an Angular component.
 *
 * ```html
 * <mdlib-markdown [source]="article.body" plugins="all" />
 * ```
 *
 * The host element *is* the custom element: Angular only sets its attributes,
 * the element renders the Markdown into itself, in the browser, with DOM APIs
 * (no HTML parsing). On the server it is rendered empty; hydration skips it
 * (`ngSkipHydration`) since its content belongs to the element.
 */
@Component({
  selector: 'mdlib-markdown',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'md',
    ngSkipHydration: 'true',
    '[attr.source]': 'source() ?? ""',
    '[attr.plugins]': 'pluginsAttr()',
    '[attr.config]': 'config() || null',
  },
})
export class MarkdownViewer {
  /** The Markdown to render. */
  readonly source = input<string | null | undefined>('')
  /** `'all'` or a list of plugin names. Default: plain CommonMark. */
  readonly plugins = input<MarkdownPlugins | null | undefined>()
  /** Name of options registered with `provideMdlibPure({ configs })`. */
  readonly config = input<string | null | undefined>()

  /** The `<mdlib-markdown>` element. */
  readonly element: MdlibElement = inject<ElementRef<MdlibElement>>(ElementRef).nativeElement

  protected readonly pluginsAttr = computed(() => pluginsAttribute(this.plugins()))

  /** Render again, e.g. after loaders were registered late (browser only). */
  refresh(): void {
    this.element.refresh?.()
  }
}
