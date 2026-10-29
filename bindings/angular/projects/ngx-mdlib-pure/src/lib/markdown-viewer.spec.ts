import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { until } from '../testing/helpers'
import { MarkdownViewer } from './markdown-viewer'
import type { MarkdownPlugins } from './plugins'
import { provideMdlibPure } from './provide'

@Component({
  imports: [MarkdownViewer],
  template: `<mdlib-markdown id="v" class="article" [source]="source()" [plugins]="plugins()" [config]="config()" />`,
})
class Host {
  readonly source = signal<string | null>('# Title\n\n| a |\n|---|\n| ~~b~~ |')
  readonly plugins = signal<MarkdownPlugins | null>(['gfm'])
  readonly config = signal<string | null>(null)
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideMdlibPure({ configs: { titled: { classes: { heading: 'title' } } } })],
  })
  const fixture = TestBed.createComponent(Host)
  const viewer = () => fixture.nativeElement.querySelector('mdlib-markdown') as HTMLElement
  return { fixture, host: fixture.componentInstance, viewer }
}

describe('MarkdownViewer', () => {
  it('is the <mdlib-markdown> element, class "md" kept next to the app’s classes', async () => {
    const { fixture, viewer } = setup()
    await fixture.whenStable()
    const el = viewer()
    expect(el.tagName).toBe('MDLIB-MARKDOWN')
    expect([...el.classList].sort()).toEqual(['article', 'md'])
    expect(el.getAttribute('source')).toBe('# Title\n\n| a |\n|---|\n| ~~b~~ |')
    expect(el.getAttribute('plugins')).toBe('gfm')
    expect(el.hasAttribute('config')).toBe(false)
    expect(el.hasAttribute('ngskiphydration')).toBe(true)
  })

  it('the element renders the Markdown with the plugins', async () => {
    const { fixture, viewer } = setup()
    await fixture.whenStable()
    expect(viewer().innerHTML).toBe('<h1>Title</h1>\n<table>\n<thead>\n<tr>\n<th>a</th>\n</tr>\n</thead>\n<tbody>\n<tr>\n<td><del>b</del></td>\n</tr>\n</tbody>\n</table>'.replaceAll('\n', ''))
  })

  it('re-renders when the inputs change; a named config applies', async () => {
    const { fixture, host, viewer } = setup()
    await fixture.whenStable()
    host.source.set('## Next ~~x~~')
    host.plugins.set(null)
    host.config.set('titled')
    await fixture.whenStable()
    expect(viewer().innerHTML).toBe('<h2 class="title">Next ~~x~~</h2>')
    host.source.set(null)
    await fixture.whenStable()
    expect(viewer().innerHTML).toBe('')
  })

  it('plugins="all": math, diagrams and every syntax are recognized', async () => {
    const { fixture, host, viewer } = setup()
    host.plugins.set('all')
    host.source.set('# T\n\n$x^2$ ==mark==\n\n::: note\nIn a box\n:::')
    await fixture.whenStable()
    await until(() => viewer().querySelector('.math'))
    expect(viewer().querySelector('h1')!.id).toBe('t')
    expect(viewer().querySelector('mark')!.textContent).toBe('mark')
    expect(viewer().querySelector('.md-container')).not.toBeNull()
  })

  it('renders again when a framework empties it (hydration with ngSkipHydration does)', async () => {
    const { fixture, viewer } = setup()
    await fixture.whenStable()
    viewer().textContent = ''
    await until(() => viewer().querySelector('h1'))
  })
})
