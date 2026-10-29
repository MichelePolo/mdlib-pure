import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, forwardRef, inject, input, model, numberAttribute, output, signal } from '@angular/core'
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import type { MdlibElement } from './markdown-viewer'
import { type MarkdownEditorView, type MarkdownPlugins, pluginsAttribute } from './plugins'

/** The `<mdlib-editor>` custom element. */
export interface MdlibEditorElement extends MdlibElement {
  /** The text in the editor. */
  value: string
}

const optionalNumber = (v: unknown): number | undefined => (v == null || v === '' ? undefined : numberAttribute(v))

/**
 * Markdown editor with live preview: the `<mdlib-editor>` Web Component, as
 * an Angular component and form control.
 *
 * ```html
 * <mdlib-editor [(value)]="body" plugins="all" style="block-size: 30rem" />
 * <mdlib-editor formControlName="body" [plugins]="['gfm']" label="Article body" />
 * <mdlib-editor [(ngModel)]="notes" name="notes" />
 * ```
 *
 * The preview renders on every keystroke, in the browser. `value` (and the
 * form control) follow after a typing pause (`delay`, 200 ms by default) and
 * at once on blur. While the user types, values that come back from Angular
 * are echoes and the element ignores them; a value set while the editor is
 * not focused (a Reset button) is applied.
 */
@Component({
  selector: 'mdlib-editor',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => MarkdownEditor), multi: true }],
  host: {
    ngSkipHydration: 'true',
    '[attr.value]': 'value()',
    '[attr.plugins]': 'pluginsAttr()',
    '[attr.config]': 'config() || null',
    '[attr.view]': 'view() || null',
    '[attr.delay]': 'delay() ?? null',
    '[attr.label]': 'label() || null',
    '[attr.name]': 'name() || null',
    // The element disables its text area and formatting buttons itself, and
    // leaves its value out of form data (like a disabled <textarea>).
    '[attr.disabled]': 'isDisabled() ? "" : null',
    '(input)': 'onElementInput($event)',
    '(change)': 'onElementChange($event)',
  },
})
export class MarkdownEditor implements ControlValueAccessor {
  /** The Markdown. Two-way: `[(value)]="body"` (a signal or a property). Updated after each typing pause. */
  readonly value = model<string>('')
  /** `'all'` or a list of plugin names for the preview. Default: plain CommonMark. */
  readonly plugins = input<MarkdownPlugins | null | undefined>()
  /** Name of options registered with `provideMdlibPure({ configs })`. */
  readonly config = input<string | null | undefined>()
  /** Panes shown at first: `split` (default), `write` or `preview`. The toolbar switches them in the browser. */
  readonly view = input<MarkdownEditorView | null | undefined>()
  /** Milliseconds of typing pause before `value` changes. Default 200. */
  readonly delay = input<number | undefined, unknown>(undefined, { transform: optionalNumber })
  /** Accessible name of the text area. Default "Markdown". */
  readonly label = input<string | null | undefined>()
  /** Form field name, for native form posts (the element is form-associated). */
  readonly name = input<string | null | undefined>()
  /** Disable the editor (forms: use the control's `disable()` instead). */
  readonly disabled = input(false, { transform: booleanAttribute })

  /** On blur, with the text at that moment (the element's `change` event). */
  readonly valueCommit = output<string>()

  /** The `<mdlib-editor>` element. */
  readonly element: MdlibEditorElement = inject<ElementRef<MdlibEditorElement>>(ElementRef).nativeElement

  readonly #formDisabled = signal(false)
  protected readonly isDisabled = computed(() => this.disabled() || this.#formDisabled())
  protected readonly pluginsAttr = computed(() => pluginsAttribute(this.plugins()))

  #onChange: (value: string) => void = () => {}
  #onTouched: () => void = () => {}

  /** The element's debounced `input` event (the text area's own events do not escape). */
  protected onElementInput(event: Event): void {
    if (event.target !== this.element) return
    const text = this.element.value
    this.value.set(text)
    this.#onChange(text)
  }

  /** The element's `change` event, on blur. */
  protected onElementChange(event: Event): void {
    if (event.target !== this.element) return
    this.#onTouched()
    this.valueCommit.emit(this.element.value)
  }

  /** Focus the text area (browser only). */
  focus(options?: FocusOptions): void {
    this.element.querySelector?.<HTMLTextAreaElement>('textarea')?.focus(options)
  }

  /** Render the preview again, e.g. after loaders were registered late (browser only). */
  refresh(): void {
    this.element.refresh?.()
  }

  // --- ControlValueAccessor ------------------------------------------------------

  writeValue(value: unknown): void {
    this.value.set(value == null ? '' : String(value))
  }

  registerOnChange(fn: (value: string) => void): void {
    this.#onChange = fn
  }

  registerOnTouched(fn: () => void): void {
    this.#onTouched = fn
  }

  setDisabledState(disabled: boolean): void {
    this.#formDisabled.set(disabled)
  }
}
