import { Component, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MarkdownEditor, MarkdownViewer } from 'ngx-mdlib-pure'
import { DESCRIPTION, NOTES } from './samples'

/** The editor as a form control: a reactive form with a required validator, and ngModel. */
@Component({
  selector: 'demo-forms-page',
  imports: [MarkdownEditor, MarkdownViewer, ReactiveFormsModule, FormsModule],
  template: `
    <h1>Forms</h1>
    <p class="lead">
      <code>&lt;mdlib-editor&gt;</code> is a <code>ControlValueAccessor</code>: <code>formControlName</code>, <code>[formControl]</code> and <code>[(ngModel)]</code>, with validators, touched on blur and the
      disabled state.
    </p>

    <section class="card">
      <h2>Reactive form <small>Validators.required</small></h2>
      <form [formGroup]="form" (ngSubmit)="save()" id="article-form">
        <label for="title">Title</label>
        <input id="title" formControlName="title" />
        <label for="description-editor">Description</label>
        <mdlib-editor id="description-editor" formControlName="description" [plugins]="['gfm', 'mark']" label="Description (Markdown)" view="write" delay="0" style="block-size: 12rem" />
        @if (form.controls.description.touched && form.controls.description.hasError('required')) {
          <p id="description-error" class="error">A description is required.</p>
        }
        <p id="form-status" class="status" [attr.data-status]="status()">Form status: {{ status() }}</p>
        <p class="actions">
          <button type="submit" id="save" [disabled]="status() !== 'VALID'">Save</button>
          <button type="button" id="reset" (click)="reset()">Reset</button>
          <button type="button" id="toggle" (click)="toggle()">{{ form.controls.description.disabled ? 'Enable' : 'Disable' }} the editor</button>
        </p>
      </form>
      @if (saved(); as s) {
        <h3>Saved</h3>
        <mdlib-markdown id="saved" [source]="'## ' + s.title + '\\n\\n' + s.description" plugins="all" />
      }
    </section>

    <section class="card">
      <h2>Template-driven form <small>[(ngModel)], required</small></h2>
      <form #notesForm="ngForm" id="notes-form">
        <mdlib-editor id="notes-editor" [(ngModel)]="notes" name="notes" required plugins="gfm" label="Notes (Markdown)" delay="0" style="block-size: 12rem" />
        <p id="notes-status" class="status" [attr.data-valid]="notesForm.valid">Notes are {{ notesForm.valid ? 'valid' : 'invalid' }}</p>
      </form>
      <pre id="notes-value">{{ notes() }}</pre>
    </section>
  `,
})
export class FormsPage {
  readonly form = new FormGroup({
    title: new FormControl('Release 1.0', { nonNullable: true, validators: Validators.required }),
    description: new FormControl(DESCRIPTION, { nonNullable: true, validators: Validators.required }),
  })
  readonly status = toSignal(this.form.statusChanges, { initialValue: this.form.status })
  readonly saved = signal<{ title: string; description: string } | null>(null)
  readonly notes = signal(NOTES)

  save(): void {
    this.saved.set(this.form.getRawValue())
  }

  reset(): void {
    this.form.reset()
  }

  toggle(): void {
    const c = this.form.controls.description
    if (c.disabled) c.enable()
    else c.disable()
  }
}
