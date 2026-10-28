// Plugins: one section per plugin with import, size, syntax, AST node, a
// rendered example and a link to its reference.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMarkdown } from '../../../src/index.ts'
import { toElements } from '../../../src/adapter.ts'
import { decodeEntity } from '../../../src/entities/index.ts'
import { toc } from '../../../src/plugins/headings.ts'
import { getFrontmatter } from '../../../src/plugins/frontmatter.ts'
import { escapeHtml, fenceFor, kb, makeMarkdown, rel, siteLinks } from '../context.js'
import { asset, page } from '../layout.js'
import { codeBlock, katexHead, pair } from './parts.js'

const PATH = '/plugins/'

/** `docs`: heading text in docs/api.md (or [doc slug, heading text]). */
export const PLUGIN_CARDS = [
  {
    id: 'gfm',
    name: 'mdlib-pure/gfm',
    adds: 'tables, task lists, footnotes, strikethrough, autolinks, alerts',
    import: "import { gfm } from 'mdlib-pure/gfm'",
    use: 'createMarkdown({ plugins: gfm() })',
    syntax: 'GitHub Flavored Markdown: `| a | b |` tables, `~~strike~~`, `www.` and URL autolinks, `- [ ]` task lists, `[^1]` footnotes, `> [!NOTE]` alerts, and the tag filter for `html: true`',
    ast: '`table { align }` › `tableRow` › `tableCell`, `delete`, `footnoteReference`, `footnoteDefinition`, `footnotes`, `taskCheckbox`, `alert { kind }`',
    plugins: ['gfm'],
    example: '| Plugin | Syntax |\n|:--|:--|\n| gfm | ~~old~~ new |\n\n- [x] done\n- [ ] todo\n\nSee www.commonmark.org.[^1]\n\n> [!NOTE]\n> An alert.\n\n[^1]: A footnote.\n',
    docs: 'mdlib-pure/gfm',
  },
  {
    id: 'headings',
    name: 'mdlib-pure/headings',
    adds: 'heading ids, permalinks, table of contents',
    import: "import { headings, toc } from 'mdlib-pure/headings'",
    use: 'createMarkdown({ plugins: [headings({ permalink: true })] })',
    syntax: 'none: a transform over existing headings. GitHub-compatible slugs, duplicates get `-1`, `-2`…; `prefix: \'user-content-\'` for untrusted input',
    ast: 'sets `heading.id`; `toc(root)` returns `{ depth, id, text }[]`',
    plugins: ['headings'],
    example: '## Install\n\n### With npm\n\n## Install\n',
    docs: 'mdlib-pure/headings',
    extra: 'toc',
  },
  {
    id: 'container',
    name: 'mdlib-pure/container',
    adds: '`:::` container blocks',
    import: "import { container } from 'mdlib-pure/container'",
    use: 'createMarkdown({ plugins: [container()] })',
    syntax: '`::: kind Title` … `:::`, nestable with longer fences (`::::`)',
    ast: '`container { kind, title, children }` → `<div class="md-container md-container-KIND">`',
    plugins: ['container'],
    example: '::: warning Before you publish\nRun `npm run verify`.\n:::\n',
    docs: 'mdlib-pure/container',
  },
  {
    id: 'math',
    name: 'mdlib-pure/math',
    adds: '`$inline$`, `$$display$$` and `$$` blocks',
    import: "import { math } from 'mdlib-pure/math'",
    use: 'createMarkdown({ plugins: [math()] })',
    syntax: '`$…$` (pandoc rules: `$5 and $6` stays text), `$$…$$` in a paragraph, `$$` fenced blocks; output works as-is with KaTeX auto-render or MathJax',
    ast: '`inlineMath { value, display? }`, `math { value, meta }`',
    plugins: ['math'],
    example: 'Inline $e^{i\\pi} + 1 = 0$, and a block:\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$\n',
    docs: 'mdlib-pure/math',
  },
  {
    id: 'mermaid',
    name: 'mdlib-pure/mermaid',
    adds: '` ```mermaid ` diagrams, no dependency on Mermaid',
    import: "import { mermaid, renderMermaid } from 'mdlib-pure/mermaid'",
    use: "createMarkdown({ plugins: [mermaid()] }) · await renderMermaid(el, { load: () => import('mermaid') })",
    syntax: 'fenced code blocks with the info string `mermaid` (as on GitHub and GitLab); `renderMermaid()` loads Mermaid only when a page has diagrams, uses `securityLevel: \'strict\'`, colors them from the `--md-*` tokens and redraws them when the color scheme changes',
    ast: '`mermaid { value }` (replaces the `code` node)',
    plugins: ['mermaid'],
    example: '```mermaid\nflowchart LR\n  md[Markdown] --> mdlib[mdlib-pure] --> svg[Diagram]\n```\n',
    docs: 'mdlib-pure/mermaid',
  },
  {
    id: 'deflist',
    name: 'mdlib-pure/deflist',
    adds: 'definition lists',
    import: "import { deflist } from 'mdlib-pure/deflist'",
    use: 'createMarkdown({ plugins: [deflist()] })',
    syntax: '`Term` on one line, `: Definition` below (Pandoc and PHP Markdown Extra style)',
    ast: '`definitionList { spread }` › `definitionTerm`, `definitionDescription { spread }`',
    plugins: ['deflist'],
    example: 'Parser\n: Turns lines into blocks, then text into inlines.\n\nRenderer\n: Turns the tree into HTML or DOM.\n',
    docs: 'mdlib-pure/deflist',
  },
  {
    id: 'mark',
    name: 'mdlib-pure/mark',
    adds: '`==highlight==`',
    import: "import { mark } from 'mdlib-pure/mark'",
    use: 'createMarkdown({ plugins: [mark()] })',
    syntax: '`==text==`, with the flanking rules of `*`',
    ast: '`mark { children }` → `<mark>`',
    plugins: ['mark'],
    example: 'This is ==very== important.\n',
    docs: 'mdlib-pure/mark',
  },
  {
    id: 'frontmatter',
    name: 'mdlib-pure/frontmatter',
    adds: 'YAML and TOML front matter',
    import: "import { frontmatter, getFrontmatter } from 'mdlib-pure/frontmatter'",
    use: 'createMarkdown({ plugins: [frontmatter()] })',
    syntax: '`---` (YAML) or `+++` (TOML) on the first line, up to the closing line; not rendered',
    ast: '`yaml { value }` or `toml { value }`, first child of `root`; `getFrontmatter(root)` returns `{ type, value } | null`',
    plugins: ['frontmatter'],
    example: '---\ntitle: Hello\n---\n# Body\n',
    docs: 'mdlib-pure/frontmatter',
    extra: 'frontmatter',
  },
  {
    id: 'adapter',
    name: 'mdlib-pure/adapter',
    adds: 'React, Preact and Vue elements',
    import: "import { toElements } from 'mdlib-pure/adapter'",
    use: "toElements(md.toVNodes(src), createElement, 'react')",
    syntax: 'none: converts VNodes with the framework’s own `h`/`createElement`; presets `react`, `preact`, `vue`',
    ast: 'no node: works on the VNodes of `md.toVNodes()`',
    plugins: [],
    example: '**Rendered** by React 19 at build time.\n',
    docs: 'mdlib-pure/adapter',
    extra: 'react',
  },
  {
    id: 'entities',
    name: 'mdlib-pure/entities',
    adds: 'the full HTML entity table, for Node, SSR and workers',
    import: "import { decodeEntity } from 'mdlib-pure/entities'",
    use: 'createMarkdown({ decodeEntity })',
    syntax: 'named entities such as `&frac12;` or `&hearts;` outside the browser (in browsers the core decodes them through the DOM)',
    ast: 'no node: decoded entities become text',
    plugins: [],
    example: 'Half: &frac12;, love: &hearts;, copyright: &copy;\n',
    docs: ['getting-started', 'Node, SSR, workers'],
    extra: 'entities',
  },
]

export function plugins({ sizes, tocs }) {
  const prose = makeMarkdown(['gfm'], { extra: [siteLinks({ from: PATH })] })
  const inline = (s) => prose.render(s).replace(/^<p>|<\/p>\n$/g, '')
  const docsLink = (card) => {
    const [slug, text] = Array.isArray(card.docs) ? card.docs : ['api', card.docs]
    const entry = tocs[slug]?.find((e) => e.text === text)
    return `/docs/${slug}/${entry ? `#${entry.id}` : ''}`
  }
  let usesMath = false
  let usesMermaid = false

  const sections = PLUGIN_CARDS.map((card) => {
    const md = makeMarkdown(card.plugins, { highlighted: false })
    let output = md.render(card.example)
    let extra = ''
    let extraMd = ''
    if (card.extra === 'toc') {
      const json = JSON.stringify(toc(md.parse(card.example)), null, 1).replace(/\n\s*/g, ' ')
      extra = codeBlock('js', `toc(md.parse(src))\n// ${json}`, 'Table of contents')
      extraMd = `\`\`\`js\ntoc(md.parse(src))\n// ${json}\n\`\`\`\n`
    } else if (card.extra === 'frontmatter') {
      const fm = JSON.stringify(getFrontmatter(md.parse(card.example)))
      extra = codeBlock('js', `getFrontmatter(md.parse(src))\n// ${fm}`, 'Reading it')
      extraMd = `\`\`\`js\ngetFrontmatter(md.parse(src))\n// ${fm}\n\`\`\`\n`
    } else if (card.extra === 'react') {
      const vnodes = createMarkdown({ decodeEntity }).toVNodes(card.example)
      output = renderToStaticMarkup(createElement('div', null, ...toElements(vnodes, createElement, 'react'))).replace(/^<div>|<\/div>$/g, '')
    } else if (card.extra === 'entities') {
      const without = createMarkdown().render(card.example).trim()
      const withTable = createMarkdown({ decodeEntity }).render(card.example).trim()
      extra = codeBlock('html', `<!-- Node, default decoder -->\n${without}\n<!-- Node, with decodeEntity -->\n${withTable}`, 'Outside the browser')
      extraMd = `\`\`\`html\n<!-- Node, default decoder -->\n${without}\n<!-- Node, with decodeEntity -->\n${withTable}\n\`\`\`\n`
    }
    const math = card.plugins.includes('math')
    usesMath ||= math
    const diagrams = card.plugins.includes('mermaid')
    usesMermaid ||= diagrams
    const docs = docsLink(card)
    const html = `
    <section class="item wrap" id="${card.id}" aria-labelledby="${card.id}-title">
      <h2 class="title" id="${card.id}-title"><span class="mk" aria-hidden="true">##</span><code>${card.name}</code></h2>
      <div class="md prose"><p>${inline(`Adds ${card.adds}.`)}</p></div>
      <dl class="specs">
        <dt>Import</dt><dd><code>${escapeHtml(card.import)}</code></dd>
        <dt>Use</dt><dd><code>${escapeHtml(card.use)}</code></dd>
        <dt>Size</dt><dd>${kb(sizes[card.id].gzip)} min + gzip</dd>
        <dt>Syntax</dt><dd>${inline(card.syntax)}</dd>
        <dt>AST</dt><dd>${inline(card.ast)}</dd>
        <dt>Reference</dt><dd><a href="${rel(PATH, docs)}">${card.id === 'entities' ? 'Getting started: Node, SSR, workers' : `API reference: ${card.name}`}</a></dd>
      </dl>
      ${card.id === 'gfm' ? gfmParts(sizes) : ''}
      ${pair(card.example, output, { math, label: card.extra === 'react' ? 'Result (React SSR)' : 'Result', outAttrs: diagrams ? ' data-mermaid' : '' })}
      ${extra}
    </section>`
    const fence = fenceFor(card.example)
    const twin = `## ${card.name}

Adds ${card.adds}.

- Import: \`${card.import}\`
- Use: \`${card.use}\`
- Size: ${kb(sizes[card.id].gzip)} min + gzip
- Syntax: ${card.syntax}
- AST: ${card.ast}
- Reference: [${card.name}](${docs})
${card.id === 'gfm' ? `\n${gfmPartsMd(sizes)}\n` : ''}
${fence}markdown
${card.example}${fence}

${extraMd}`
    return { html, twin }
  })

  const intro = 'Each plugin is its own entry point: import only what you use. Sizes are measured at build time like `npm run size`: minified, gzipped, with the core counted once (plugins are measured without it).'
  const body = `
    <header class="page-head wrap">
      <h1 class="title"><span class="mk" aria-hidden="true">#</span>Plugins</h1>
      <p class="lede">${inline(intro)}</p>
      <ul class="jump">${PLUGIN_CARDS.map((c) => `<li><a href="#${c.id}">${c.id}</a></li>`).join('')}</ul>
    </header>
    ${sections.map((s) => s.html).join('\n')}
    <section class="item wrap" aria-labelledby="own">
      <h2 class="title" id="own"><span class="mk" aria-hidden="true">##</span>Write your own</h2>
      <p>${inline('A plugin is a plain object with `block`, `inline`, `delimiters`, `transform` and `render` fields. [`AGENTS.md`](/docs/extending/) explains how to choose the extension point and has a recipe for each; `templates/plugin` in the repository is a complete, tested plugin to copy. It is written so that an AI agent can follow it: see [For AI agents](/docs/agents/).')}</p>
    </section>`

  const html = page({
    path: PATH,
    section: 'plugins',
    title: 'Plugins',
    description: 'The first-party plugins of mdlib-pure: GFM, headings, containers, math, Mermaid diagrams, definition lists, mark, front matter, the framework adapter and the entity table.',
    body,
    head: `${usesMath ? katexHead(PATH) : ''}${usesMermaid ? `\n  <script type="module" src="${asset(PATH, 'js/mermaid-init.js')}"></script>` : ''}`,
  })

  const twin = `# Plugins

${intro}

${sections.map((s) => s.twin).join('\n')}
## Write your own

A plugin is a plain object with \`block\`, \`inline\`, \`delimiters\`, \`transform\` and \`render\` fields. [\`AGENTS.md\`](/docs/extending/) explains how to choose the extension point and has a recipe for each. See also [For AI agents](/docs/agents/).
`
  return { path: PATH, html, md: twin }
}

const GFM_PARTS = [
  ['table', '`| a | b |` with a delimiter row', '`table`, `tableRow`, `tableCell`'],
  ['strikethrough', '`~~text~~` or `~text~`', '`delete`'],
  ['autolink', '`www.x.com`, `https://…`, emails', '`link`'],
  ['tasklist', '`- [ ]` and `- [x]` items', '`listItem.checked`, `taskCheckbox`'],
  ['footnotes', '`[^label]` and `[^label]: text`', '`footnoteReference`, `footnoteDefinition`, `footnotes`'],
  ['tagfilter', 'with `html: true`, neutralizes `<script>`, `<iframe>`…', '(changes `html` nodes)'],
  ['alerts', '`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`', '`alert { kind }`'],
]

function gfmPartsMd(sizes) {
  const rows = GFM_PARTS.map(([id, syntax, ast]) => `| \`${id}()\` | ${syntax} | ${ast} | ${kb(sizes.gfmParts[id].gzip)} |`).join('\n')
  return `Each part is also exported on its own, and \`gfm({ footnotes: false })\` turns one off:\n\n| Part | Syntax | AST | gzip |\n|:--|:--|:--|--:|\n${rows}`
}

function gfmParts(sizes) {
  const md = makeMarkdown(['gfm'], { highlighted: false })
  return `<div class="md table-wrap gfm-parts">${md.render(gfmPartsMd(sizes))}</div>`
}
