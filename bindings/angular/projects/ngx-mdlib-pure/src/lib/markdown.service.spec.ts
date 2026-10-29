import { TestBed } from '@angular/core/testing'
import { getMarkdown, PLUGIN_NAMES } from 'mdlib-pure/element'
import { MarkdownService } from './markdown.service'
import { MARKDOWN_PLUGINS, pluginsAttribute } from './plugins'
import { provideMdlibPure } from './provide'

const doc = `---
title: x
---

# Release notes &ndash; 1.0

Some *text*, $x^2$ and ==mark==.

## What's new

- [x] done

## What's new
`

describe('MarkdownService', () => {
  let service: MarkdownService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideMdlibPure({ configs: { prefixed: { classes: { paragraph: 'para' } } } })],
    })
    service = TestBed.inject(MarkdownService)
  })

  it('parse(): the mdast-style AST, with the plugins asked for', () => {
    const root = service.parse(doc, 'all')
    expect(root.type).toBe('root')
    expect(root.children.map((n) => n.type)).toEqual(['yaml', 'heading', 'paragraph', 'heading', 'list', 'heading'])
    const plain = service.parse(doc)
    expect(plain.children[0].type).toBe('thematicBreak')
  })

  it('toc(): headings with ids, the headings plugin always on, entities decoded', () => {
    expect(service.toc(doc, ['frontmatter'])).toEqual([
      { depth: 1, id: 'release-notes--10', text: 'Release notes – 1.0' },
      { depth: 2, id: 'whats-new', text: "What's new" },
      { depth: 2, id: 'whats-new-1', text: "What's new" },
    ])
    expect(service.toc('# A')).toEqual([{ depth: 1, id: 'a', text: 'A' }])
  })

  it('render(): the same HTML as the elements, a named config applies', () => {
    expect(service.render(doc, 'all')).toBe(getMarkdown('all').render(doc))
    expect(service.render('Hi', null, 'prefixed')).toBe('<p class="para">Hi</p>\n')
    expect(service.render('==x==', ['mark'])).toBe('<p><mark>x</mark></p>\n')
    expect(service.render('==x==')).toBe('<p>==x==</p>\n')
  })

  it('instance(): the shared instance of the elements', () => {
    expect(service.instance(['gfm', 'math'])).toBe(getMarkdown('gfm math'))
    expect(service.instance('all', 'prefixed')).toBe(getMarkdown('all', 'prefixed'))
  })
})

describe('plugins', () => {
  it('MARKDOWN_PLUGINS are the elements’ plugin names, in their order', () => {
    expect([...MARKDOWN_PLUGINS]).toEqual([...PLUGIN_NAMES])
  })

  it('pluginsAttribute(): "all", one name, names joined, nothing for empty', () => {
    expect(pluginsAttribute('all')).toBe('all')
    expect(pluginsAttribute('math')).toBe('math')
    expect(pluginsAttribute(['math', 'gfm'])).toBe('math gfm')
    expect(pluginsAttribute([])).toBeNull()
    expect(pluginsAttribute(null)).toBeNull()
    expect(pluginsAttribute(undefined)).toBeNull()
  })
})
