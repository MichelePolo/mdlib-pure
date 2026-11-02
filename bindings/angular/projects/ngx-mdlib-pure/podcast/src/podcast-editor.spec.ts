import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { By } from '@angular/platform-browser'
import { sleep, until } from '../../src/testing/helpers'
import { type MdlibPodcastEditorElement, PodcastEditor, podcastEpisode } from './podcast-editor'
import type { PodcastDocumentEvent, PodcastEpisode, PodcastGrammar, PodcastTaskEvent, PodcastTimer } from './podcast-types'

const SOURCE = '[ ] @Nora Introduction [](time:5:00:00)'

function setup<T>(host: new () => T) {
  const fixture = TestBed.createComponent(host)
  // As in an app, where creation and the first bindings happen in one pass: the
  // element reads its hosting attributes (tasks, documents…) when it mounts.
  fixture.detectChanges()
  const editors = () => [...fixture.nativeElement.querySelectorAll('mdlib-podcast-editor')] as MdlibPodcastEditorElement[]
  return { fixture, host: fixture.componentInstance, editor: () => editors()[0], editors }
}

const root = (el: Element) => el.shadowRoot!
const input = (el: Element) => root(el).querySelector<HTMLTextAreaElement>('#podcast-input')!
const preview = (el: Element) => root(el).querySelector<HTMLElement>('#podcast-preview')!
/** The element mounts its editor once its stylesheets are adopted (a microtask after connection). */
const mounted = (el: Element) => until(() => el.shadowRoot?.querySelector('#podcast-input'))

/** Type like a user: the text area gets the text and its own `input` event. */
function type(el: Element, text: string): void {
  const ta = input(el)
  ta.focus()
  ta.value = text
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PodcastEditor: markup', () => {
  @Component({
    imports: [PodcastEditor],
    template: `<mdlib-podcast-editor id="p" class="mine" [(value)]="episode" [participants]="people()" view="write" delay="500"
      label="Rundown" name="episode" [grammar]="grammar" [tagColors]="colors" tasks="notify" documents="host"
      readOnly compact [currentLine]="line()" [runningTimer]="timer()" />`,
  })
  class Host {
    readonly episode = signal(podcastEpisode({ source: SOURCE }))
    readonly people = signal(['Nora', 'Elio'])
    readonly grammar: PodcastGrammar = { durations: 'clock', tags: { mentions: 'any', hashtags: true } }
    readonly colors = { Nora: 'green' }
    readonly line = signal<number | null>(0)
    readonly timer = signal<PodcastTimer | null>({ line: 0, index: 0, text: '-0:05' })
  }

  it('is the <mdlib-podcast-editor> element itself, with every input as an attribute', async () => {
    const { fixture, editor } = setup(Host)
    await fixture.whenStable()
    const el = editor()
    expect(el.tagName).toBe('MDLIB-PODCAST-EDITOR')
    expect(el.id).toBe('p')
    expect(el.classList.contains('mine')).toBe(true)
    expect(el.hasAttribute('ngskiphydration')).toBe(true)
    expect(JSON.parse(el.getAttribute('value')!).source).toBe(SOURCE)
    expect(el.getAttribute('participants')).toBe('["Nora","Elio"]')
    expect(el.getAttribute('view')).toBe('write')
    expect(el.getAttribute('delay')).toBe('500')
    expect(el.getAttribute('label')).toBe('Rundown')
    expect(el.getAttribute('name')).toBe('episode')
    expect(JSON.parse(el.getAttribute('grammar')!)).toEqual({ durations: 'clock', tags: { mentions: 'any', hashtags: true } })
    expect(el.getAttribute('tag-colors')).toBe('{"Nora":"green"}')
    expect(el.getAttribute('tasks')).toBe('notify')
    expect(el.getAttribute('documents')).toBe('host')
    expect(el.hasAttribute('readonly')).toBe(true)
    expect(el.hasAttribute('compact')).toBe(true)
    expect(el.getAttribute('current-line')).toBe('0')
    expect(el.getAttribute('running-timer')).toBe('0:0:-0:05')
  })

  it('live inputs follow; unset ones remove their attribute', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    host.line.set(null)
    host.timer.set(null)
    host.people.set(['Vera'])
    await fixture.whenStable()
    expect(editor().hasAttribute('current-line')).toBe(false)
    expect(editor().hasAttribute('running-timer')).toBe(false)
    expect(editor().getAttribute('participants')).toBe('["Vera"]')
  })
})

describe('PodcastEditor: [(value)]', () => {
  @Component({
    imports: [PodcastEditor],
    template: `<mdlib-podcast-editor [(value)]="episode" [participants]="people()" [delay]="delay" (valueCommit)="commits.push($event)" />`,
  })
  class Host {
    readonly episode = signal(podcastEpisode({ source: SOURCE, documents: { Notes: '@Elio ideas' } }))
    readonly people = signal(['Nora', 'Elio'])
    delay = 0
    readonly commits: PodcastEpisode[] = []
  }

  it('renders the rundown in its shadow root, with badges, and computes the planned duration', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    await mounted(editor())
    expect(input(editor()).value).toBe(SOURCE)
    expect(preview(editor()).querySelector('.podcast-mention')!.textContent).toContain('Nora')
    expect(preview(editor()).querySelector('.podcast-time')).not.toBeNull()
    expect(document.querySelector('#podcast-input')).toBeNull() // isolated: no id leaks into the page
    await until(() => host.episode().durationCentiseconds === 30_000)
    expect(host.episode().documents).toEqual({ Notes: '@Elio ideas' })
    expect(host.episode().activeDocument).toBe('Scaletta')
  })

  it('typing updates the preview at once and the signal after the delay', async () => {
    const { fixture, host, editor } = setup(Host)
    host.delay = 300
    await fixture.whenStable()
    await mounted(editor())
    type(editor(), '[ ] @Elio Typed [](time:1:00)')
    await until(() => preview(editor()).textContent!.includes('Typed'))
    expect(host.episode().source).toBe(SOURCE)
    await until(() => host.episode().source === '[ ] @Elio Typed [](time:1:00)')
    expect(host.episode().durationCentiseconds).toBe(6000)
    await fixture.whenStable()
    expect(JSON.parse(editor().getAttribute('value')!).source).toBe('[ ] @Elio Typed [](time:1:00)')
    expect(input(editor()).value).toBe('[ ] @Elio Typed [](time:1:00)')
  })

  it('a value set from code reaches the element', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    await mounted(editor())
    host.episode.set(podcastEpisode({ source: '# From code' }))
    await fixture.whenStable()
    expect(input(editor()).value).toBe('# From code')
    await until(() => preview(editor()).querySelector('h1')?.textContent === 'From code')
  })

  it('valueCommit fires when focus leaves the editor, not on each typing pause', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    await mounted(editor())
    type(editor(), 'one')
    await until(() => host.episode().source === 'one')
    expect(host.commits).toEqual([])
    input(editor()).blur()
    expect(host.commits.map((e) => e.source)).toEqual(['one'])
  })

  it('valueCommit fires on blur, with the episode; the pending value is sent first', async () => {
    const { fixture, host, editor } = setup(Host)
    host.delay = 10_000
    await fixture.whenStable()
    await mounted(editor())
    type(editor(), 'draft')
    input(editor()).blur()
    await fixture.whenStable()
    expect(host.episode().source).toBe('draft')
    expect(host.commits.at(-1)?.source).toBe('draft')
  })

  it('participants are live: a new name becomes a badge', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    await mounted(editor())
    host.episode.set(podcastEpisode({ source: '@Vera hello' }))
    await fixture.whenStable()
    expect(preview(editor()).querySelector('.podcast-mention')).toBeNull()
    host.people.set(['Vera'])
    await fixture.whenStable()
    await until(() => preview(editor()).querySelector('.podcast-mention')?.textContent?.includes('Vera'))
  })
})

describe('PodcastEditor: two instances', () => {
  @Component({
    imports: [PodcastEditor],
    template: `<mdlib-podcast-editor [(value)]="a" delay="0" /><mdlib-podcast-editor [(value)]="b" delay="0" />`,
  })
  class Host {
    readonly a = signal(podcastEpisode({ source: 'first' }))
    readonly b = signal(podcastEpisode({ source: 'second' }))
  }

  it('are independent', async () => {
    const { fixture, host, editors } = setup(Host)
    await fixture.whenStable()
    const [one, two] = editors()
    await mounted(one)
    await mounted(two)
    type(two, 'changed')
    await until(() => host.b().source === 'changed')
    expect(host.a().source).toBe('first')
    expect(input(one).value).toBe('first')
  })
})

describe('PodcastEditor: hosted modes', () => {
  @Component({
    imports: [PodcastEditor],
    template: `<mdlib-podcast-editor [value]="episode" [participants]="['Nora']" [tasks]="tasks" [documents]="documents"
      (taskToggle)="toggles.push($event)" (openDocument)="opened.push($event)" (activeDocumentChange)="active.push($event)" />`,
  })
  class Host {
    episode = podcastEpisode({ source: '[ ] @Nora First\n\n[scheda](Notes)', documents: { Notes: 'notes' } })
    tasks: 'edit' | 'notify' = 'notify'
    documents: 'local' | 'host' = 'host'
    readonly toggles: PodcastTaskEvent[] = []
    readonly opened: PodcastDocumentEvent[] = []
    readonly active: string[] = []
  }

  it('tasks="notify": a checkbox click emits taskToggle and leaves the source alone', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    await mounted(editor())
    root(editor()).querySelector<HTMLButtonElement>('.podcast-check')!.click()
    await until(() => host.toggles.length === 1)
    expect(host.toggles[0]).toMatchObject({ document: 'Scaletta', checked: true, line: 0, box: 0 })
    expect(input(editor()).value).toBe(host.episode.source)
  })

  it('documents="host": a document button emits openDocument', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    await mounted(editor())
    await until(() => root(editor()).querySelector('.podcast-document'))
    root(editor()).querySelector<HTMLButtonElement>('.podcast-document')!.click()
    await until(() => host.opened.length === 1)
    expect(host.opened[0]).toEqual({ name: 'Notes', title: 'Notes' })
  })

  it('documents="local": switching tabs emits activeDocumentChange', async () => {
    const { fixture, host, editor } = setup(Host)
    host.documents = 'local'
    await fixture.whenStable()
    await mounted(editor())
    const tab = [...root(editor()).querySelectorAll<HTMLButtonElement>('#podcast-tabs button')].find((b) => b.textContent?.includes('Notes'))!
    tab.click()
    await until(() => host.active.includes('Notes'))
    expect(input(editor()).value).toBe('notes')
  })
})

describe('PodcastEditor: reactive forms', () => {
  @Component({
    imports: [PodcastEditor, ReactiveFormsModule],
    template: `<mdlib-podcast-editor [formControl]="episode" delay="0" />`,
  })
  class Host {
    readonly episode = new FormControl<PodcastEpisode>(podcastEpisode({ source: 'initial' }), { nonNullable: true })
  }

  it('writeValue, onChange, touched on blur', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    await mounted(editor())
    expect(input(editor()).value).toBe('initial')
    host.episode.setValue(podcastEpisode({ source: 'set' }))
    await fixture.whenStable()
    expect(input(editor()).value).toBe('set')
    type(editor(), 'typed')
    await until(() => host.episode.value.source === 'typed')
    expect(host.episode.dirty).toBe(true)
    expect(host.episode.touched).toBe(false)
    input(editor()).blur()
    expect(host.episode.touched).toBe(true)
  })

  it('disable() makes the editor inert and leaves it out of the form value; enable() restores it', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    await mounted(editor())
    host.episode.disable()
    await fixture.whenStable()
    expect(editor().hasAttribute('disabled')).toBe(true)
    await sleep(0)
    expect(root(editor()).querySelector<HTMLElement>('.podcast')!.inert).toBe(true)
    host.episode.enable()
    await fixture.whenStable()
    expect(editor().hasAttribute('disabled')).toBe(false)
    expect(root(editor()).querySelector<HTMLElement>('.podcast')!.inert).toBe(false)
  })

  it('writeValue(null) gives an empty episode', async () => {
    const { fixture, editor } = setup(Host)
    await fixture.whenStable()
    const component = fixture.debugElement.query(By.directive(PodcastEditor)).componentInstance as PodcastEditor
    component.writeValue(null)
    await fixture.whenStable()
    expect(JSON.parse(editor().getAttribute('value')!)).toEqual(podcastEpisode())
  })
})
