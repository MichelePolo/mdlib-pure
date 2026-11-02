import { Component, computed, signal } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { PodcastEditor, type PodcastEpisode, podcastEpisode } from 'ngx-mdlib-pure/podcast'

const SOURCE = `# An imaginary garden

[ ] @Nora Introduction [](time:2:00:00)
[ ] @Elio The greenhouse [](time:5:30:00)
[ ] @Vera Questions from listeners [](time:3:00:00)

[scheda](Notes)`

/** Planned duration as m:ss (from the editor's centiseconds). */
const clock = (cs: number) => `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}`

/** ngx-mdlib-pure/podcast: two-way binding of a typed episode, live participants, a form control. */
@Component({
  selector: 'demo-podcast-page',
  imports: [PodcastEditor, ReactiveFormsModule],
  template: `
    <h1>Podcast editor</h1>
    <p class="lead">
      <code>ngx-mdlib-pure/podcast</code>: the rundown editor of mdlib-pure's podcast sample, bound as a typed <code>PodcastEpisode</code>. Fictional people and content.
    </p>

    <section class="card">
      <h2>[(value)] <small>planned <output id="planned">{{ planned() }}</output></small></h2>
      <mdlib-podcast-editor id="podcast" [(value)]="episode" [participants]="people()" delay="0" (activeDocumentChange)="active.set($event)" />
      <p class="actions">
        <button type="button" id="add-person" (click)="people.set(['Nora', 'Elio', 'Vera', 'Ines'])">Add Ines</button>
        <button type="button" id="replace" (click)="replace()">Replace from code</button>
      </p>
      <p id="active">Open document: {{ active() }}</p>
      <pre id="episode-json">{{ json() }}</pre>
    </section>

    <section class="card">
      <h2>Reactive form <small>[formControl]</small></h2>
      <mdlib-podcast-editor id="podcast-form" [formControl]="control" [participants]="['Nora']" view="write" compact delay="0" />
      <p id="podcast-form-state" [attr.data-touched]="touched()">Source: {{ formSource() }}</p>
      <button type="button" id="podcast-blur">Elsewhere</button>
    </section>
  `,
})
export class PodcastPage {
  readonly episode = signal<PodcastEpisode>(podcastEpisode({ source: SOURCE, documents: { Notes: '@Elio Ideas for the greenhouse.' } }))
  readonly people = signal(['Nora', 'Elio', 'Vera'])
  readonly active = signal('Scaletta')
  readonly planned = computed(() => clock(this.episode().durationCentiseconds))
  readonly json = computed(() => JSON.stringify(this.episode(), null, 2))

  readonly control = new FormControl<PodcastEpisode>(podcastEpisode({ source: '[ ] @Nora First point' }), { nonNullable: true })
  readonly formSource = signal(this.control.value.source)
  readonly touched = signal(false)

  constructor() {
    this.control.valueChanges.subscribe((v) => this.formSource.set(v.source))
    this.control.events.subscribe(() => this.touched.set(this.control.touched))
  }

  replace(): void {
    this.episode.set(podcastEpisode({ source: '# Replaced\n\n[ ] @Ines Only point [](time:1:00:00)' }))
  }
}
