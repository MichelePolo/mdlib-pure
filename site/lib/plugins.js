// Plugin registry shared by the build (Node) and the browser bundles, so the
// samples page, the hero example and the playground render with the same
// configuration. Sources come straight from src/ (Node runs the .ts files,
// esbuild bundles them for the browser).
import { container } from '../../src/plugins/container.ts'
import { deflist } from '../../src/plugins/deflist.ts'
import { frontmatter } from '../../src/plugins/frontmatter.ts'
import { gfm } from '../../src/gfm/index.ts'
import { headings } from '../../src/plugins/headings.ts'
import { mark } from '../../src/plugins/mark.ts'
import { math } from '../../src/plugins/math.ts'

/** Plugins the site can toggle, in the order they are applied. */
export const PLUGINS = [
  { id: 'gfm', label: 'GFM', hint: 'tables, task lists, footnotes, strikethrough, autolinks, alerts', make: () => gfm() },
  { id: 'headings', label: 'Headings', hint: 'heading ids and permalinks', make: () => [headings({ permalink: true })] },
  { id: 'math', label: 'Math', hint: '$…$ and $$…$$, typeset with KaTeX', make: () => [math()] },
  { id: 'container', label: 'Containers', hint: '::: kind Title … :::', make: () => [container()] },
  { id: 'deflist', label: 'Definition lists', hint: 'Term / : Definition', make: () => [deflist()] },
  { id: 'mark', label: 'Mark', hint: '==highlight==', make: () => [mark()] },
  { id: 'frontmatter', label: 'Front matter', hint: 'YAML --- or TOML +++', make: () => [frontmatter()] },
]

/** Plugin list for a set of ids, in registry order. */
export function pluginsFor(ids) {
  const on = new Set(ids)
  return PLUGINS.filter((p) => on.has(p.id)).flatMap((p) => p.make())
}

/** The `createMarkdown(…)` call that matches a set of ids, for display. */
export function configFor(ids) {
  const on = PLUGINS.filter((p) => ids.includes(p.id))
  if (!on.length) return 'createMarkdown()'
  if (on.length === 1 && on[0].id === 'gfm') return 'createMarkdown({ plugins: gfm() })'
  const calls = on.map((p) => (p.id === 'gfm' ? '...gfm()' : p.id === 'headings' ? 'headings({ permalink: true })' : `${p.id}()`))
  return `createMarkdown({ plugins: [${calls.join(', ')}] })`
}
