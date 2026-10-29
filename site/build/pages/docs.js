// Docs: the repository's Markdown rendered by mdlib-pure (dogfooding), with a
// sidebar, a per-page table of contents (headings plugin + toc()) and links
// between docs rewritten to site URLs.
import { toc } from '../../../src/plugins/headings.ts'
import { DOC_PLUGINS, DOCS, escapeHtml, githubUrl, makeMarkdown, read, rel, rewriteTwin, siteLinks, twinOf } from '../context.js'
import { page } from '../layout.js'
import { katexHead } from './parts.js'

const INDEX = '/docs/'

function sideNav(path) {
  const link = (to, label, attrs = '') => `<li><a href="${rel(path, to)}"${to === path ? ' aria-current="page"' : ''}${attrs}>${label}</a></li>`
  const docs = DOCS.filter((d) => !d.site).map((d) => link(d.path, escapeHtml(d.title))).join('')
  const agents = [
    link('/docs/agents/', 'For AI agents'),
    link('/llms.txt', '<code>llms.txt</code>', ' type="text/plain"'),
    link('/llms-full.txt', '<code>llms-full.txt</code>', ' type="text/plain"'),
  ].join('')
  return { docs: `<ul>${link(INDEX, 'Overview')}${docs}</ul>`, agents: `<ul>${agents}</ul>` }
}

function frame(path, { article, entries = [], foot = '', note = '' }) {
  const math = article.includes('class="math')
  const nav = sideNav(path)
  const tocList = entries.length
    ? `<ul>${entries.map((e) => `<li class="d${e.depth}"><a href="#${escapeHtml(e.id)}">${escapeHtml(e.text)}</a></li>`).join('')}</ul>`
    : ''
  return `
    <div class="docs">
      <nav class="side" aria-label="Documentation">
        <h2>Documentation</h2>
        ${nav.docs}
        <h2>For AI agents</h2>
        ${nav.agents}
      </nav>
      <div class="doc-body">
        <details class="disclosure mobile-only"><summary>Documentation pages</summary>${nav.docs}${nav.agents}</details>
        ${tocList ? `<details class="disclosure toc-mobile"><summary>On this page</summary>${tocList}</details>` : ''}
        ${note ? `<aside class="md doc-note" aria-label="Note from this site">${note}</aside>` : ''}
        <article class="md"${math ? ' data-katex' : ''}>
${article}
        </article>
        ${foot}
      </div>
      ${tocList ? `<nav class="side toc" aria-label="On this page"><h2>On this page</h2>${tocList}</nav>` : ''}
    </div>`
}

export function docs() {
  const pages = []
  const tocs = {}

  DOCS.forEach((doc, i) => {
    const src = read(doc.source)
    const md = makeMarkdown(DOC_PLUGINS, { extra: [siteLinks({ from: doc.path, repo: doc.repo })] })
    const root = md.parse(src)
    const entries = toc(root).filter((e) => e.depth === 2 || e.depth === 3)
    tocs[doc.slug] = toc(root)
    const article = md.render(root)
    const prev = DOCS[i - 1]
    const next = DOCS[i + 1]
    const twin = twinOf(doc.path)
    const origin = doc.site
      ? `Written for this site and rendered by mdlib-pure at build time.`
      : `Rendered by mdlib-pure at build time from <a href="${githubUrl(doc.source)}"><code>${doc.source}</code></a> in the repository.`
    const foot = `
        <nav class="doc-foot" aria-label="Previous and next page">
          ${prev ? `<a class="prev" href="${rel(doc.path, prev.path)}" rel="prev"><small>Previous</small>${escapeHtml(prev.title)}</a>` : ''}
          ${next ? `<a class="next" href="${rel(doc.path, next.path)}" rel="next"><small>Next</small>${escapeHtml(next.title)}</a>` : ''}
        </nav>
        <p class="muted source-note">${origin} <a href="${rel(doc.path, twin)}" type="text/markdown">Markdown version</a>.</p>`
    const note = doc.note ? makeMarkdown(['gfm'], { extra: [siteLinks({ from: doc.path })] }).render(`> [!NOTE]\n> ${doc.note}\n`) : ''
    const html = page({
      path: doc.path,
      section: doc.slug === 'agents' ? 'agents' : 'docs',
      title: doc.title,
      description: doc.description ?? `mdlib-pure ${doc.title.toLowerCase()}: ${doc.summary.replace(/`/g, '')}.`,
      body: frame(doc.path, { article, entries, foot, note }),
      head: article.includes('class="math') ? katexHead(doc.path) : '',
    })
    pages.push({ path: doc.path, html, md: rewriteTwin(src, { from: twin, repo: doc.repo }), title: doc.title, source: doc.source })
  })

  // Overview
  const rows = DOCS.filter((d) => !d.site)
    .map((d) => `| [${d.title}](${d.path}) | [\`${d.source}\`](${githubUrl(d.source)}) | ${d.summary} |`)
    .join('\n')
  const overview = `# Documentation

These pages are the repository's own Markdown files, rendered at build time by
mdlib-pure itself with \`gfm()\`, \`headings({ permalink: true })\` (ids,
permalinks and the table of contents from \`toc()\`), \`math()\`,
\`container()\`, \`deflist()\` and \`mark()\`. Links between the files point to
these pages; other repository paths link to GitHub. Every guide of the
repository (\`docs/*.md\`, \`bindings/*/README.md\`) has a page here: the site
build fails if one is missing.

| Page | Source | Covers |
|:--|:--|:--|
${rows}

## For AI agents

Read [\`/llms.txt\`](/llms.txt) for an index of the Markdown version of every
page, or [\`/llms-full.txt\`](/llms-full.txt) for all the docs in one file.
[\`AGENTS.md\`](/docs/extending/) is the contract for extending the library.
More in [For AI agents](/docs/agents/).
`
  const md = makeMarkdown(['gfm'], { extra: [siteLinks({ from: INDEX })] })
  pages.unshift({
    path: INDEX,
    html: page({
      path: INDEX,
      section: 'docs',
      title: 'Documentation',
      description: 'mdlib-pure documentation: getting started, API reference, Web Components, the Blazor wrapper, design tokens, security, the plugin guide (AGENTS.md) and the changelog.',
      body: frame(INDEX, { article: md.render(overview) }),
    }),
    md: rewriteTwin(overview, { from: twinOf(INDEX) }),
  })
  return { pages, tocs }
}
