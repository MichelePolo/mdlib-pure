import { ApplicationInitStatus, Component, PLATFORM_ID } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { until } from '../testing/helpers'
import { MarkdownService } from './markdown.service'
import { MarkdownViewer } from './markdown-viewer'
import { provideMdlibPure } from './provide'

@Component({ imports: [MarkdownViewer], template: `<mdlib-markdown source="Formula: $x^2$" plugins="math" />` })
class Host {}

describe('provideMdlibPure()', () => {
  it('browser: defines both elements before the first render', () => {
    TestBed.configureTestingModule({ providers: [provideMdlibPure()] })
    TestBed.inject(MarkdownService)
    expect(customElements.get('mdlib-markdown')).toBeDefined()
    expect(customElements.get('mdlib-editor')).toBeDefined()
  })

  it('browser: the KaTeX loader runs only for a document with math, on the element', async () => {
    const typeset: Element[] = []
    TestBed.configureTestingModule({
      providers: [
        provideMdlibPure({
          loaders: {
            katex: async () => (el) => {
              typeset.push(el)
              for (const m of el.querySelectorAll('.math')) m.setAttribute('data-typeset', '')
            },
          },
        }),
      ],
    })
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const viewer = fixture.nativeElement.querySelector('mdlib-markdown') as HTMLElement
    await until(() => viewer.querySelector('.math[data-typeset]'))
    expect(typeset.at(-1)).toBe(viewer)
  })

  it('server platform: no element is touched, initializers complete, the service works', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }, provideMdlibPure({ configs: { s: { classes: { paragraph: 's' } } } })],
    })
    await TestBed.inject(ApplicationInitStatus).donePromise
    expect(TestBed.inject(MarkdownService).render('a &copy; b')).toBe('<p>a © b</p>\n')
  })
})
