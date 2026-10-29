import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { blur, nextFrame, sleep, textarea, type, until } from '../testing/helpers'
import { MarkdownEditor, type MdlibEditorElement } from './markdown-editor'
import type { MarkdownEditorView, MarkdownPlugins } from './plugins'
import { provideMdlibPure } from './provide'

function setup<T>(host: new () => T) {
  TestBed.configureTestingModule({ providers: [provideMdlibPure()] })
  const fixture = TestBed.createComponent(host)
  const editor = () => fixture.nativeElement.querySelector('mdlib-editor') as MdlibEditorElement
  return { fixture, host: fixture.componentInstance, editor }
}

describe('MarkdownEditor: markup', () => {
  @Component({
    imports: [MarkdownEditor],
    template: `<mdlib-editor id="e" [(value)]="text" [plugins]="plugins()" config="docs" [view]="view()" [delay]="delay()" label="Body" name="body" class="mine" />`,
  })
  class Host {
    readonly text = signal('# Hello *world*')
    readonly plugins = signal<MarkdownPlugins | null>(['gfm', 'math'])
    readonly view = signal<MarkdownEditorView>('split')
    readonly delay = signal<number | undefined>(500)
  }

  it('is the <mdlib-editor> element itself, with every input as an attribute', async () => {
    const { fixture, editor } = setup(Host)
    await fixture.whenStable()
    const el = editor()
    expect(el.tagName).toBe('MDLIB-EDITOR')
    expect(el.id).toBe('e')
    expect(el.classList.contains('mine')).toBe(true)
    expect(el.getAttribute('value')).toBe('# Hello *world*')
    expect(el.getAttribute('plugins')).toBe('gfm math')
    expect(el.getAttribute('config')).toBe('docs')
    expect(el.getAttribute('view')).toBe('split')
    expect(el.getAttribute('delay')).toBe('500')
    expect(el.getAttribute('label')).toBe('Body')
    expect(el.getAttribute('name')).toBe('body')
    expect(el.hasAttribute('ngskiphydration')).toBe(true)
    expect(el.hasAttribute('disabled')).toBe(false)
    expect(textarea(el).disabled).toBe(false)
  })

  it('the element renders its toolbar, the text area and the preview', async () => {
    const { fixture, editor } = setup(Host)
    await fixture.whenStable()
    const el = editor()
    expect(el.querySelector('.mdlib-editor-toolbar [aria-label^="Bold"]')).not.toBeNull()
    expect(textarea(el).value).toBe('# Hello *world*')
    expect(textarea(el).getAttribute('aria-label')).toBe('Body')
    expect(el.querySelector('.mdlib-editor-preview')!.innerHTML).toBe('<h1>Hello <em>world</em></h1>')
    expect(el.value).toBe('# Hello *world*')
  })

  it('attributes follow the inputs; empty plugins remove the attribute', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    host.plugins.set('all')
    host.view.set('preview')
    host.delay.set(undefined)
    await fixture.whenStable()
    expect(editor().getAttribute('plugins')).toBe('all')
    expect(editor().getAttribute('view')).toBe('preview')
    expect(editor().hasAttribute('delay')).toBe(false)
    expect(editor().querySelector('[data-view="preview"]')!.getAttribute('aria-pressed')).toBe('true')
    host.plugins.set([])
    await fixture.whenStable()
    expect(editor().hasAttribute('plugins')).toBe(false)
    host.plugins.set(null)
    await fixture.whenStable()
    expect(editor().hasAttribute('plugins')).toBe(false)
  })
})

describe('MarkdownEditor: [(value)]', () => {
  @Component({
    imports: [MarkdownEditor],
    template: `<mdlib-editor [(value)]="text" [delay]="delay" (valueCommit)="commits.push($event)" plugins="all" />`,
  })
  class Host {
    readonly text = signal('# Start')
    delay = 0
    readonly commits: string[] = []
  }

  it('typing updates the preview at once and the signal after the delay', async () => {
    const { fixture, host, editor } = setup(Host)
    host.delay = 300
    await fixture.whenStable()
    type(editor(), '# Typed')
    await nextFrame()
    expect(editor().querySelector('.mdlib-editor-preview h1')!.textContent).toBe('Typed')
    expect(host.text()).toBe('# Start')
    await until(() => host.text() === '# Typed')
    await fixture.whenStable()
    expect(editor().getAttribute('value')).toBe('# Typed')
    expect(textarea(editor()).value).toBe('# Typed')
  })

  it('a value set from code reaches the element', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    host.text.set('## From code')
    await fixture.whenStable()
    expect(editor().value).toBe('## From code')
    expect(editor().querySelector('.mdlib-editor-preview h2')!.textContent).toBe('From code')
  })

  it('valueCommit fires on blur, with the text; the pending value is sent first', async () => {
    const { fixture, host, editor } = setup(Host)
    host.delay = 10_000
    await fixture.whenStable()
    type(editor(), 'draft')
    blur(editor())
    await fixture.whenStable()
    expect(host.text()).toBe('draft')
    expect(host.commits).toEqual(['draft'])
  })

  it('fast typing with every keystroke sent (delay 0) loses nothing', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    let text = ''
    for (const ch of 'The quick brown fox') {
      text += ch
      type(editor(), text)
      if (text.length % 3 === 0) await sleep(1)
    }
    await until(() => host.text() === text)
    await fixture.whenStable()
    await sleep(20)
    expect(textarea(editor()).value).toBe(text)
    expect(host.text()).toBe(text)
  })
})

describe('MarkdownEditor: reactive forms', () => {
  @Component({
    imports: [MarkdownEditor, ReactiveFormsModule],
    template: `<mdlib-editor [formControl]="body" delay="0" />`,
  })
  class Host {
    readonly body = new FormControl('# Initial', { nonNullable: true, validators: Validators.required })
  }

  it('writeValue: the control value reaches the element, initially and on setValue', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    expect(editor().value).toBe('# Initial')
    host.body.setValue('## Set')
    await fixture.whenStable()
    expect(editor().value).toBe('## Set')
    expect(host.body.dirty).toBe(false)
  })

  it('onChange: the element’s input event updates the control and its validity', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    expect(host.body.valid).toBe(true)
    type(editor(), '')
    await until(() => host.body.value === '')
    expect(host.body.valid).toBe(false)
    expect(host.body.dirty).toBe(true)
    await fixture.whenStable()
    expect(editor().classList.contains('ng-invalid')).toBe(true)
    type(editor(), 'text')
    await until(() => host.body.valid)
  })

  it('touched on change (blur), not before', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    type(editor(), 'x')
    await until(() => host.body.value === 'x')
    expect(host.body.touched).toBe(false)
    blur(editor())
    expect(host.body.touched).toBe(true)
    await fixture.whenStable()
    expect(editor().classList.contains('ng-touched')).toBe(true)
  })

  it('disabled state: the element disables its text area and formatting; enable restores it', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    host.body.disable()
    await fixture.whenStable()
    expect(editor().hasAttribute('disabled')).toBe(true)
    expect(editor().matches(':disabled')).toBe(true)
    expect(textarea(editor()).disabled).toBe(true)
    expect(editor().querySelector<HTMLButtonElement>('button:not([data-view])')!.disabled).toBe(true)
    host.body.enable()
    await fixture.whenStable()
    expect(editor().hasAttribute('disabled')).toBe(false)
    expect(textarea(editor()).disabled).toBe(false)
  })

  it('writeValue(null) clears the editor', async () => {
    const { fixture, editor } = setup(Host)
    await fixture.whenStable()
    const cva = fixture.debugElement.children[0].injector.get(MarkdownEditor)
    cva.writeValue(null)
    await fixture.whenStable()
    expect(editor().value).toBe('')
  })

  it('updateOn: "blur" commits the value when the editor loses focus', async () => {
    @Component({ imports: [MarkdownEditor, ReactiveFormsModule], template: `<mdlib-editor [formControl]="body" delay="0" />` })
    class BlurHost {
      readonly body = new FormControl('', { nonNullable: true, updateOn: 'blur' })
    }
    const { fixture, host, editor } = setup(BlurHost)
    await fixture.whenStable()
    type(editor(), 'later')
    await sleep(20)
    expect(host.body.value).toBe('')
    blur(editor())
    expect(host.body.value).toBe('later')
  })
})

describe('MarkdownEditor: ngModel', () => {
  @Component({
    imports: [MarkdownEditor, FormsModule],
    template: `<form #f="ngForm"><mdlib-editor [(ngModel)]="notes" name="notes" required delay="0" [disabled]="off" /></form>`,
  })
  class Host {
    notes = '- one'
    off = false
  }

  it('binds both ways, with the required validator and the native form field name', async () => {
    const { fixture, host, editor } = setup(Host)
    await fixture.whenStable()
    expect(editor().value).toBe('- one')
    expect(editor().getAttribute('name')).toBe('notes')
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement
    expect(new FormData(form).get('notes')).toBe('- one')
    type(editor(), '- two')
    await until(() => host.notes === '- two')
    type(editor(), '')
    await until(() => host.notes === '')
    await fixture.whenStable()
    expect(editor().classList.contains('ng-invalid')).toBe(true)
  })

  it('[disabled] disables the editor', async () => {
    const { fixture, host, editor } = setup(Host)
    host.off = true
    fixture.changeDetectorRef.markForCheck()
    await fixture.whenStable()
    expect(textarea(editor()).disabled).toBe(true)
  })
})
