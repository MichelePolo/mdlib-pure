import { isPlatformBrowser } from '@angular/common'
import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, forwardRef, inject, input, model, numberAttribute, output, PLATFORM_ID, signal } from '@angular/core'
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms'
import { defineElement, PODCAST_STYLES } from './element.generated'
import type { PodcastDocumentEvent, PodcastEpisode, PodcastGrammar, PodcastTaskEvent, PodcastTimer } from './podcast-types'

/** The `<mdlib-podcast-editor>` custom element. */
export interface MdlibPodcastEditorElement extends HTMLElement {
  /** The episode as JSON (also the element's form value). */
  value: string
}

const optionalNumber = (v: unknown): number | undefined => (v == null || v === '' ? undefined : numberAttribute(v))
const nullableNumber = (v: unknown): number | null => (v == null || v === '' ? null : numberAttribute(v))
const json = (v: unknown): string | null => (v == null ? null : JSON.stringify(v))

/** A complete episode from some of its fields (the others take their defaults). */
export function podcastEpisode(init: Partial<PodcastEpisode> = {}): PodcastEpisode {
  return { source: '', documents: {}, activeDocument: 'Scaletta', durationCentiseconds: 0, ...init }
}

function episodeOf(value: string): PodcastEpisode {
  try {
    const parsed: unknown = JSON.parse(value)
    return podcastEpisode(parsed && typeof parsed === 'object' ? (parsed as Partial<PodcastEpisode>) : {})
  } catch {
    return podcastEpisode()
  }
}

/** The shadow root's stylesheets, built once per page (browser only). */
let sheets: CSSStyleSheet[] | undefined
function stylesheets(): CSSStyleSheet[] {
  return (sheets ??= PODCAST_STYLES.map((css) => {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(css)
    return sheet
  }))
}

/**
 * The podcast rundown editor of mdlib-pure's sample: `@name` badges and
 * completion, planned durations, checkboxes and supporting documents, with a
 * live preview. The `<mdlib-podcast-editor>` element, as an Angular component
 * and form control (the same element as the Blazor wrapper's PodcastEditor).
 *
 * ```html
 * <mdlib-podcast-editor [(value)]="episode" [participants]="['Nora', 'Elio']" />
 * <mdlib-podcast-editor formControlName="episode" />
 * ```
 *
 * The whole episode is bound as a `PodcastEpisode`. The preview renders on
 * every keystroke, in the browser; `value` follows after a typing pause
 * (`delay`, 200 ms) and at once on blur. The element is defined on first use,
 * in the browser only; its styles live in its shadow root.
 */
@Component({
  selector: 'mdlib-podcast-editor',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PodcastEditor), multi: true }],
  host: {
    ngSkipHydration: 'true',
    '[attr.value]': 'valueAttr()',
    '[attr.participants]': 'participantsAttr()',
    '[attr.view]': 'view() || null',
    '[attr.delay]': 'delay() ?? null',
    '[attr.label]': 'label() || null',
    '[attr.name]': 'name() || null',
    '[attr.disabled]': 'isDisabled() ? "" : null',
    '[attr.grammar]': 'grammarAttr()',
    '[attr.tag-colors]': 'tagColorsAttr()',
    '[attr.tasks]': 'tasks() === "notify" ? "notify" : null',
    '[attr.documents]': 'documents() === "host" ? "host" : null',
    '[attr.readonly]': 'readOnly() ? "" : null',
    '[attr.compact]': 'compact() ? "" : null',
    '[attr.current-line]': 'currentLine() ?? null',
    '[attr.running-timer]': 'runningTimerAttr()',
    '(input)': 'onElementInput($event)',
    '(change)': 'onElementChange($event)',
    '(podcast-task)': 'onTask($event)',
    '(podcast-document)': 'onDocument($event)',
    '(podcast-active)': 'onActive($event)',
  },
})
export class PodcastEditor implements ControlValueAccessor {
  /** The episode. Two-way: `[(value)]="episode"`. Updated after each typing pause. */
  readonly value = model<PodcastEpisode>(podcastEpisode())
  /** Names offered by `@` completion and rendered as badges. Default: the sample's fictional names. */
  readonly participants = input<readonly string[] | null | undefined>()
  /** Panes shown at first: `split` (default), `write` or `preview`. */
  readonly view = input<'split' | 'write' | 'preview' | null | undefined>()
  /** Milliseconds of typing pause before `value` changes. Default 200. */
  readonly delay = input<number | undefined, unknown>(undefined, { transform: optionalNumber })
  /** Accessible name of the text area. Default "Sorgente Markdown". */
  readonly label = input<string | null | undefined>()
  /** Form field name, for native form posts: the episode as JSON. */
  readonly name = input<string | null | undefined>()
  /** Disable the editor (forms: use the control's `disable()` instead). */
  readonly disabled = input(false, { transform: booleanAttribute })
  /** Grammar options of the podcast plugin, read when the element connects. */
  readonly grammar = input<PodcastGrammar | null | undefined>()
  /** Fixed tag colours by name (compared ignoring case). Live. */
  readonly tagColors = input<Readonly<Record<string, string>> | null | undefined>()
  /** `edit` (default: a checkbox click rewrites the source) or `notify` (only `taskToggle`). */
  readonly tasks = input<'edit' | 'notify'>('edit')
  /** `local` (default: tabs over `documents`) or `host` (a document button only emits `openDocument`). */
  readonly documents = input<'local' | 'host'>('local')
  /** Preview only: toolbar and source hidden, checkboxes and document buttons still live. Live. */
  readonly readOnly = input(false, { transform: booleanAttribute })
  /** No header, legend, status bar or pane labels. Read when the element connects. */
  readonly compact = input(false, { transform: booleanAttribute })
  /** 0-based source line of the current point, highlighted in the preview. Live. */
  readonly currentLine = input<number | null, unknown>(null, { transform: nullableNumber })
  /** The timer chip shown as running. Live. */
  readonly runningTimer = input<PodcastTimer | null | undefined>()

  /** When focus leaves the editor, with the episode at that moment. */
  readonly valueCommit = output<PodcastEpisode>()
  /** A checkbox was clicked while `tasks` is `notify`. */
  readonly taskToggle = output<PodcastTaskEvent>()
  /** A document button was clicked while `documents` is `host`. */
  readonly openDocument = output<PodcastDocumentEvent>()
  /** The editor switched tabs: the name of the document shown. */
  readonly activeDocumentChange = output<string>()

  /** The `<mdlib-podcast-editor>` element. */
  readonly element: MdlibPodcastEditorElement = inject<ElementRef<MdlibPodcastEditorElement>>(ElementRef).nativeElement

  readonly #formDisabled = signal(false)
  protected readonly isDisabled = computed(() => this.disabled() || this.#formDisabled())
  protected readonly valueAttr = computed(() => JSON.stringify(this.value() ?? podcastEpisode()))
  protected readonly participantsAttr = computed(() => json(this.participants()))
  protected readonly grammarAttr = computed(() => json(this.grammar()))
  protected readonly tagColorsAttr = computed(() => json(this.tagColors()))
  protected readonly runningTimerAttr = computed(() => {
    const t = this.runningTimer()
    return t ? `${t.line}:${t.index}${t.text ? `:${t.text}` : ''}` : null
  })

  #onChange: (value: PodcastEpisode) => void = () => {}
  #onTouched: () => void = () => {}

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) defineElement({ styles: stylesheets() })
  }

  /** The element's debounced `input` event (the inner text area's events do not escape). */
  protected onElementInput(event: Event): void {
    if (event.target !== this.element) return
    const episode = episodeOf(this.element.value)
    this.value.set(episode)
    this.#onChange(episode)
  }

  /** The element's `change` event: focus left the editor (the pending value was sent first). */
  protected onElementChange(event: Event): void {
    if (event.target !== this.element) return
    this.#onTouched()
    this.valueCommit.emit(episodeOf(this.element.value))
  }

  protected onTask(event: Event): void {
    this.taskToggle.emit((event as CustomEvent<PodcastTaskEvent>).detail)
  }

  protected onDocument(event: Event): void {
    this.openDocument.emit((event as CustomEvent<PodcastDocumentEvent>).detail)
  }

  protected onActive(event: Event): void {
    this.activeDocumentChange.emit((event as CustomEvent<{ name: string }>).detail.name)
  }

  /** Focus the text area (browser only). */
  focus(options?: FocusOptions): void {
    this.element.shadowRoot?.querySelector<HTMLTextAreaElement>('textarea')?.focus(options)
  }

  // --- ControlValueAccessor ------------------------------------------------------

  writeValue(value: unknown): void {
    this.value.set(value && typeof value === 'object' ? podcastEpisode(value as Partial<PodcastEpisode>) : podcastEpisode())
  }

  registerOnChange(fn: (value: PodcastEpisode) => void): void {
    this.#onChange = fn
  }

  registerOnTouched(fn: () => void): void {
    this.#onTouched = fn
  }

  setDisabledState(disabled: boolean): void {
    this.#formDisabled.set(disabled)
  }
}
