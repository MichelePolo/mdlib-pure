// Heading ids, optional permalinks, and a table of contents.
//
//   import { headings, toc } from 'mdlib-pure/headings'
//   const md = createMarkdown({ plugins: [headings({ permalink: true })] })
//   const root = md.parse(src)
//   toc(root)       // [{ depth: 1, id: 'intro', text: 'Intro' }, …]
//   md.render(root)
//
// Slugs follow GitHub (github-slugger): lowercase; drop everything except
// letters, marks, numbers, `_`, spaces and `-`; spaces become `-`; repeats
// get `-1`, `-2`… Headings without slug characters get `section`.
//
// AST: sets `heading.id` (prefix included).
// HTML: <h2 id="ID">…</h2>, plus with `permalink`:
//       <a class="md-anchor" href="#ID" aria-label="Permalink: TEXT">#</a>
//
// Untrusted input: ids from content can shadow globals (`window.config`,
// "DOM clobbering"). Use a prefix such as `user-content-` there.

import type { Heading, Node, Plugin } from '../types.ts'
import { visit } from '../util/visit.ts'

export interface HeadingsOptions {
  /** Prepended to every id. Default `''`. */
  prefix?: string
  /** Append a `#` permalink inside each heading. Default `false`. */
  permalink?: boolean
}

export interface TocEntry {
  depth: number
  id: string
  text: string
}

/** Text content of a heading, as a reader sees it (no image alt, no raw HTML). */
export function headingText(node: Node): string {
  let s = ''
  for (const child of node.children ?? []) {
    if (child.type === 'text' || child.type === 'inlineCode') s += child.value as string
    else if (child.type !== 'image' && child.type !== 'html') s += headingText(child)
  }
  return s
}

const reNotSlug = /[^\p{L}\p{M}\p{N}\p{Pc} -]/gu

export const slug = (text: string): string => text.toLowerCase().replace(reNotSlug, '').replace(/ /g, '-')

/** Returns a slugger that de-duplicates across one document. */
export function slugger(): (text: string) => string {
  const seen = new Map<string, number>() // a Map: "constructor" is a fine heading
  return (text) => {
    const base = slug(text) || 'section'
    let id = base
    while (seen.has(id)) {
      const n = seen.get(base)! + 1
      seen.set(base, n)
      id = `${base}-${n}`
    }
    seen.set(id, 0)
    return id
  }
}

/** Collect headings that have an id (run after parsing with the plugin). */
export function toc(root: Node): TocEntry[] {
  const out: TocEntry[] = []
  visit(root, (n) => {
    if (n.type === 'heading' && typeof n.id === 'string') out.push({ depth: n.depth as number, id: n.id, text: headingText(n) })
  })
  return out
}

export function headings(options: HeadingsOptions = {}): Plugin {
  const prefix = options.prefix ?? ''
  return {
    name: 'headings',
    transform(root) {
      const next = slugger()
      visit(root, (n) => {
        if (n.type !== 'heading') return
        n.id = prefix + next(headingText(n))
        return false
      })
    },
    render: {
      heading(n, r) {
        const id = n.id as string | undefined
        const anchor =
          options.permalink && id
            ? [' ', r.h('a', { class: 'md-anchor', href: `#${id}`, 'aria-label': `Permalink: ${headingText(n)}` }, '#')]
            : []
        return r.h(`h${(n as Heading).depth}`, id ? { id } : null, r.children(n), anchor)
      },
    },
  }
}
