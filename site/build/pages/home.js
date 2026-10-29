// Home: hero with a live example, datasheet, ways to use it, plugins,
// benchmark, agents.
import { abs, BLAZOR_RELEASE, escapeHtml, fenceFor, kb, makeMarkdown, num, PKG, read, REPO, rel, siteLinks } from '../context.js'
import { asset, page } from '../layout.js'
import { PLUGIN_CARDS } from './plugins.js'

const PATH = '/'

export const HERO_SOURCE = `## Try it here

The result updates **as you type**,
with \`gfm()\` and ==mark==.

- [x] CommonMark 0.31.2, 652 of 652 examples
- [x] tables, ~~strikethrough~~, footnotes, alerts
- [ ] your plugin

> [!TIP]
> The DOM is built without parsing HTML.
`

/** The entry points, each with a short snippet. `text` and `links` are Markdown. */
const uses = (sizes) => [
  {
    id: 'use-js',
    title: 'JavaScript',
    text: 'The core API: `render()` returns an HTML string, `renderTo()` builds DOM nodes without parsing HTML. Each plugin is one more import.',
    lang: 'js',
    code: `import { createMarkdown } from 'mdlib-pure'
import { gfm } from 'mdlib-pure/gfm'

const md = createMarkdown({ plugins: gfm() })
md.render('# Hello')        // an HTML string
md.renderTo(el, '# Hello')  // DOM nodes, no HTML parsing`,
    links: '[Getting started](/docs/getting-started/) · [API reference](/docs/api/)',
  },
  {
    id: 'use-html',
    title: 'HTML: Web Components',
    text: `\`mdlib-pure/element\` defines \`<mdlib-markdown>\`, a viewer, and \`<mdlib-editor>\`, an editor with toolbar and live preview, for plain pages and any framework. Core and every plugin included: ${kb(sizes.element.gzip)} gzip.`,
    lang: 'html',
    code: `<script type="module">
  // with a bundler or an import map
  import { defineElements } from 'mdlib-pure/element'
  defineElements()
</script>

<mdlib-markdown class="md" plugins="gfm"
  source="# Hello"></mdlib-markdown>
<mdlib-editor name="body" plugins="all"
  value="# Draft"></mdlib-editor>`,
    links: '[Web Components guide](/docs/elements/) · [Live sample](/samples/#elements)',
  },
  {
    id: 'use-frameworks',
    title: 'React, Preact, Vue',
    text: '`mdlib-pure/adapter` turns the output into elements with the framework’s own `createElement` or `h`, following its conventions: `className`, `defaultChecked`, keys.',
    lang: 'jsx',
    code: `import { createElement } from 'react'
import { toElements } from 'mdlib-pure/adapter'

export const Markdown = ({ source }) => (
  <article className="md">
    {toElements(md.toVNodes(source), createElement, 'react')}
  </article>
)
// Vue: toElements(vnodes, h, 'vue')
// Preact: toElements(vnodes, h, 'preact')`,
    links: '[The adapter](/plugins/#adapter) · [React sample](/samples/#react)',
  },
  {
    id: 'use-blazor',
    title: 'Blazor (.NET 10)',
    text: '`MdlibPure.Blazor` 0.1.0 wraps the Web Components for every render mode (Static SSR, Server, WebAssembly, Auto): `@bind-Value`, `EditForm` validation, and a C# service for the AST. Not on nuget.org yet: the `.nupkg` is attached to the GitHub release.',
    lang: 'razor',
    code: `@using MdlibPure.Blazor

<MarkdownEditor @bind-Value="Body" Plugins="MarkdownPlugins.All" />
<Markdown Value="@Body" Plugins="MarkdownPlugins.Gfm" />`,
    links: `[Blazor guide](/docs/blazor/) · [Download 0.1.0 from the GitHub release](${BLAZOR_RELEASE})`,
  },
  {
    id: 'use-angular',
    title: 'Angular (21, 22)',
    text: '`ngx-mdlib-pure` 0.1.0: standalone components whose tag is the Web Component, `[(value)]` with signals, a form control for `ngModel` and reactive forms, SSR with hydration, and a service for the AST. Not on npm yet, like mdlib-pure: install both from tarballs.',
    lang: 'ts',
    code: `// app.config.ts
providers: [provideMdlibPure({ loaders: { mermaid: () => import('mermaid') } })]

// a component, imports: [MarkdownEditor, MarkdownViewer]
template: \`
  <mdlib-editor [(value)]="body" plugins="all" />
  <mdlib-markdown [source]="body()" plugins="all" />\``,
    links: '[Angular guide](/docs/angular/) · [Install from tarballs](/docs/angular/#install)',
  },
]

/** The hero's install line: the package is not on the npm registry yet. */
const INSTALL_NOTE = 'Not on the npm registry yet: build the tarball with `npm pack` in a clone of the repository. [How to install](/docs/getting-started/#install).'

const USES_INTRO = 'One parser and one renderer behind five entry points: pick the one your stack speaks. None is on a package registry yet: each guide says how to install it today.'

function benchmark() {
  const r = JSON.parse(read('bench/results.json'))
  const lib = (id) => r.libs.find((l) => l.id === id)
  const conf = (id) => r.conformance.find((c) => c.id === id)
  const size = (id) => r.size.find((s) => s.id === id)
  const mbs = (id, input) => num(r.throughput[id][input].median, 1)
  const row = (id, bold) => {
    const b = (s) => (bold ? `**${s}**` : s)
    const s = size(id)
    return `| ${b(lib(id).name)} | ${b(`${conf(id).exact}/652`)} | ${mbs(id, 'spec')} | ${mbs(id, 'readme')} | ${s ? b(kb(s.gzip, 1)) : '—'} |`
  }
  const gfm = (id) => `${lib(id).name} ${mbs(id, 'spec')} / ${mbs(id, 'readme')} MB/s`
  const table = [
    '| Library | CommonMark examples (exact) | spec.txt MB/s | README MB/s | min + gzip |',
    '|:--|--:|--:|--:|--:|',
    row('mdlib-pure', true),
    row('marked'),
    row('markdown-it'),
    row('commonmark'),
  ].join('\n')
  const date = new Date(r.env.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  const notes = `Node ${r.env.node.replace(/^v/, '')}, render to an HTML string, median of ${r.env.config.rounds} runs, measured on ${date}; differences under about 10% are noise. With GFM: ${gfm('mdlib-pure+gfm')}, ${gfm('marked+gfm')}, ${gfm('markdown-it+gfm')}; mdlib-pure also does footnotes, task lists and alerts.`
  return { table, notes }
}

export function home({ sizes, llmsHead }) {
  const core = kb(sizes.core.gzip)
  const md = makeMarkdown(['gfm', 'deflist', 'mark'], { extra: [siteLinks({ from: PATH })] })
  const hero = makeMarkdown(['gfm', 'mark'])

  const datasheet = `CommonMark 0.31.2
: 652 of 652 spec examples, with byte-identical output

GitHub Flavored Markdown
: 54 of 54 extension examples, in the optional \`mdlib-pure/gfm\` plugin (${kb(sizes.gfm.gzip)} gzip)

Size
: ${core} minified and gzipped, within a 15 KB budget checked by \`npm run size\`

Runtime dependencies
: none, checked by \`npm run check\`

Safe by default
: raw HTML not recognized, URLs filtered by an allowlist, DOM built without parsing HTML

Linear time
: on adversarial input too: 30+ hostile inputs with time limits in \`test/pathological.test.ts\`

Output
: an HTML string, DOM nodes, React, Preact and Vue elements through the adapter, or the \`<mdlib-markdown>\` and \`<mdlib-editor>\` Web Components, which the [Blazor](/docs/blazor/) and [Angular](/docs/angular/) wrappers build on
`

  const pluginRows = PLUGIN_CARDS.map((p) => `| [\`${p.name}\`](/plugins/#${p.id}) | ${p.adds}${p.whole ? ' (core and every plugin included)' : ''} | ${kb(sizes[p.id].gzip)} |`).join('\n')
  const plugins = `| Plugin | Adds | gzip |\n|:--|:--|--:|\n${pluginRows}`

  const bench = benchmark()
  const useCards = uses(sizes)
  const inline = (text) => md.render(text).replace(/^<p>|<\/p>\n$/g, '')

  const agents = `This site reads fine without a browser. Every page has a Markdown version at the same address with \`.md\`, and [\`/llms.txt\`](/llms.txt) lists them all.

- Start at [\`/llms.txt\`](/llms.txt), or take everything in one file with [\`/llms-full.txt\`](/llms-full.txt).
- [\`AGENTS.md\`](/docs/extending/) is the extension contract: rules checked by commands, recipes for each extension point, a definition of done.
- To get a plugin from an agent: “Read AGENTS.md and write a plugin that…”, then let it run \`npm run verify\`. Example prompts are in the [guide for agents](/docs/agents/).
- To use it in an app rather than extend it, the guides are [\`docs/elements.md\`](/docs/elements/) for the Web Components, [\`bindings/blazor/README.md\`](/docs/blazor/) for Blazor and [\`bindings/angular/README.md\`](/docs/angular/) for Angular; all are in \`llms-full.txt\`.
- Nothing is on a registry yet: no \`npm install mdlib-pure\`, no NuGet package. Each guide's Install section says what works today.
`

  const lede = `mdlib-pure renders Markdown to HTML in the browser and follows CommonMark to the letter: all 652 spec examples, in ${core} gzipped, with zero dependencies.`

  const body = `
    <section class="hero wrap" aria-labelledby="title">
      <div>
        <h1 id="title" class="title"><span class="mk" aria-hidden="true">#</span>Markdown, to the letter.</h1>
        <p class="lede">${escapeHtml(lede)}</p>
        <div class="install"><code>npm install ./mdlib-pure-0.1.0.tgz</code><button type="button" class="js-only" data-copy="npm install ./mdlib-pure-0.1.0.tgz" aria-label="Copy the install command">Copy</button></div>
        <p class="install-note muted">${inline(INSTALL_NOTE)}</p>
        <p class="actions">
          <a class="btn btn-primary" href="${rel(PATH, '/docs/getting-started/')}">Read the docs</a>
          <a class="btn" href="${rel(PATH, '/playground/')}">Open the playground</a>
        </p>
      </div>
      <figure class="live">
        <div class="pair">
          <div class="pane pane-src">
            <p class="pane-label" id="hero-src-label">Markdown</p>
            <textarea id="hero-src" aria-labelledby="hero-src-label" spellcheck="false">${escapeHtml(HERO_SOURCE)}</textarea>
          </div>
          <div class="pane">
            <p class="pane-label">Result</p>
            <div id="hero-out" class="md pane-out">${hero.render(HERO_SOURCE)}</div>
          </div>
        </div>
        <figcaption>A live example: edit the text, mdlib-pure renders it in your browser.</figcaption>
      </figure>
    </section>

    <section class="section" aria-labelledby="datasheet">
      <div class="wrap">
        <h2 class="title" id="datasheet"><span class="mk" aria-hidden="true">##</span>Datasheet</h2>
        <div class="md datasheet">${md.render(datasheet)}</div>
      </div>
    </section>

    <section class="section" aria-labelledby="use">
      <div class="wrap">
        <h2 class="title" id="use"><span class="mk" aria-hidden="true">##</span>Ways to use it</h2>
        <div class="prose"><p>${escapeHtml(USES_INTRO)}</p></div>
        <div class="uses">
          ${useCards
            .map(
              (u) => `<section class="use" aria-labelledby="${u.id}">
            <h3 class="title" id="${u.id}">${escapeHtml(u.title)}</h3>
            <div class="md use-text">${md.render(u.text)}</div>
            <div class="md use-code">${md.render(`\`\`\`${u.lang}\n${u.code}\n\`\`\`\n`)}</div>
            <p class="use-links">${inline(u.links)}</p>
          </section>`,
            )
            .join('\n          ')}
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="plugins">
      <div class="wrap">
        <h2 class="title" id="plugins"><span class="mk" aria-hidden="true">##</span>Plugins</h2>
        <div class="prose">
          <p>The core does CommonMark and nothing else. Everything else is one import away: each plugin is a separate module, measured on its own, so you pay only for what you use. First-party plugins use the same API that is open to you: block rules, inline rules, delimiter runs, AST transforms and render overrides.</p>
        </div>
        <div class="md table-wrap num-last">${md.render(plugins)}</div>
        <p><a href="${rel(PATH, '/plugins/')}">All plugins, with syntax and examples</a></p>
      </div>
    </section>

    <section class="section" aria-labelledby="performance">
      <div class="wrap">
        <h2 class="title" id="performance"><span class="mk" aria-hidden="true">##</span>Performance</h2>
        <div class="prose"><p>As fast as marked, faster than markdown-it, smaller than both, and as conformant as commonmark.js.</p></div>
        <div class="md table-wrap num-table">${md.render(bench.table)}</div>
        <p class="muted prose">${escapeHtml(bench.notes)} <a href="${REPO}/blob/main/bench/RESULTS.md">Full method and results</a>.</p>
      </div>
    </section>

    <section class="section" aria-labelledby="agents">
      <div class="wrap split">
        <div class="prose">
          <h2 class="title" id="agents"><span class="mk" aria-hidden="true">##</span>For AI agents</h2>
          <div class="md">${md.render(agents)}</div>
        </div>
        <div class="md">
          <p class="pane-label code-caption">The start of <a href="${rel(PATH, '/llms.txt')}">/llms.txt</a></p>
          <pre class="wrap-pre"><code class="language-markdown">${escapeHtml(llmsHead)}</code></pre>
        </div>
      </div>
    </section>
`

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: 'mdlib-pure',
    description: PKG.description,
    inLanguage: 'en',
    url: abs('/'),
    codeRepository: REPO,
    programmingLanguage: ['TypeScript', 'JavaScript'],
    runtimePlatform: ['Browser', `Node.js ${PKG.engines.node}`],
    license: 'https://opensource.org/licenses/MIT',
    version: PKG.version,
    keywords: PKG.keywords,
    author: { '@type': 'Person', name: 'Michele Polo' },
  }

  const html = page({
    path: PATH,
    section: 'home',
    title: 'mdlib-pure: Markdown, to the letter',
    description: `Markdown renderer for the browser: CommonMark 652/652, GFM as a plugin, zero dependencies, ${core} gzip, safe by default.`,
    body,
    jsonld,
    scripts: [asset(PATH, 'js/home.js')],
  })

  const fence = fenceFor(llmsHead)
  const twin = `# mdlib-pure: Markdown, to the letter

${lede}

${INSTALL_NOTE}

\`\`\`sh
npm install ./mdlib-pure-0.1.0.tgz
\`\`\`

- [Read the docs](/docs/getting-started/)
- [Open the playground](/playground/)

## Live example

${fenceFor(HERO_SOURCE)}markdown
${HERO_SOURCE}${fenceFor(HERO_SOURCE)}

## Datasheet

${datasheet}
## Ways to use it

${USES_INTRO}

${useCards.map((u) => `### ${u.title}\n\n${u.text}\n\n\`\`\`${u.lang}\n${u.code}\n\`\`\`\n\n${u.links}\n`).join('\n')}
## Plugins

The core does CommonMark and nothing else. Everything else is one import away: each plugin is a separate module, measured on its own. [All plugins](/plugins/).

${plugins}

## Performance

${bench.table}

${bench.notes} [Full method and results](${REPO}/blob/main/bench/RESULTS.md).

## For AI agents

${agents}
${fence}markdown
${llmsHead}
${fence}
`
  return { path: PATH, html, md: twin }
}
