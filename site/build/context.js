// Shared build helpers: site constants, URL mapping, the Markdown factory.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMarkdown } from '../../src/index.ts'
import { decodeEntity } from '../../src/entities/index.ts'
import { visit } from '../../src/util/visit.ts'
import { highlight } from '../lib/highlight.js'
import { pluginsFor } from '../lib/plugins.js'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const SITE = join(ROOT, 'site')
export const OUT = join(SITE, 'out')
export const REPO = 'https://github.com/MichelePolo/mdlib-pure'
export const BRANCH = 'main'
/** Absolute base URL for canonical links, sitemap, llms.txt and JSON-LD. */
export const SITE_URL = (process.env.SITE_URL ?? 'https://michelepolo.github.io/mdlib-pure').replace(/\/+$/, '')
export const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

export const read = (path) => readFileSync(join(ROOT, path), 'utf8')

/** The Blazor wrapper's release: the .nupkg is attached there (not on nuget.org). */
export const BLAZOR_RELEASE = `${REPO}/releases/tag/blazor-v0.1.0`
/** mdlib-pure is not on the npm registry yet: its tarball is attached to this release. */
export const MDLIB_RELEASE = `${REPO}/releases/tag/mdlib-pure-v0.1.1`
export const MDLIB_TARBALL = `${REPO}/releases/download/mdlib-pure-v0.1.1/mdlib-pure-0.1.1.tgz`

/**
 * Docs pages, rendered from the repository's own Markdown (`source`). Only
 * the agents page is written for the site. Every `docs/*.md` and
 * `bindings/*\/README.md` must be here: the build fails otherwise (see
 * checkDocsCoverage() in scripts/build-site.js). `note` (Markdown) is shown
 * above the page, for what the site knows and the file does not say.
 */
export const DOCS = [
  { slug: 'getting-started', title: 'Getting started', source: 'README.md', summary: 'install, usage, options, highlighting, frameworks, styling, plugins, performance' },
  { slug: 'api', title: 'API reference', source: 'docs/api.md', summary: '`createMarkdown()`, options, methods, AST shape, rendering helpers, every plugin' },
  {
    slug: 'elements',
    title: 'Web Components',
    source: 'docs/elements.md',
    summary: '`<mdlib-markdown>` and `<mdlib-editor>` (`mdlib-pure/element`): attributes, loaders, named configs, events, form value, frameworks that rewrite the page',
    description: 'The mdlib-pure Web Components: the <mdlib-markdown> viewer and the <mdlib-editor> editor with live preview, for plain HTML and any framework.',
  },
  {
    slug: 'blazor',
    title: 'Blazor',
    source: 'bindings/blazor/README.md',
    summary: '`MdlibPure.Blazor` 0.1.0 for .NET 10: `<MarkdownEditor>`, `<Markdown>`, every render mode, the AST service; the `.nupkg` is on the GitHub release',
    description: 'MdlibPure.Blazor: a Markdown editor with live preview and a viewer for Blazor (.NET 10) in every render mode, built on the mdlib-pure Web Components, with a C# AST service.',
    note: `The package is not on nuget.org yet: download \`MdlibPure.Blazor.0.1.0.nupkg\` from the [GitHub release](${BLAZOR_RELEASE}) and use it from a local feed as described under [Install](#install).`,
  },
  {
    slug: 'angular',
    title: 'Angular',
    source: 'bindings/angular/README.md',
    summary: '`ngx-mdlib-pure` 0.1.0 for Angular 21 and 22: `<mdlib-editor [(value)]>` (a form control too), `<mdlib-markdown>`, `provideMdlibPure()`, `MarkdownService`, SSR with hydration',
    description: 'ngx-mdlib-pure: a Markdown editor with live preview and a viewer for Angular 21 and 22, standalone components with signals and forms, SSR with hydration, built on the mdlib-pure Web Components.',
    note: `Neither \`ngx-mdlib-pure\` nor \`mdlib-pure\` is on the npm registry yet: install both tarballs from the [GitHub releases](${REPO}/releases/tag/angular-v0.1.0), as described under [Install](#install).`,
  },
  { slug: 'tokens', title: 'Design tokens', source: 'docs/tokens.md', summary: 'the `--md-*` tokens of `theme.css`, light and dark, Tailwind CSS v4' },
  { slug: 'security', title: 'Security', source: 'docs/security.md', summary: 'what is guaranteed by default, raw HTML, URL policy, DOM clobbering' },
  { slug: 'extending', title: 'Extending: plugin guide', source: 'AGENTS.md', summary: 'AGENTS.md: rules, how parsing works, recipes for every extension point' },
  { slug: 'changelog', title: 'Changelog', source: 'CHANGELOG.md', summary: 'notable changes in each version' },
  { slug: 'agents', title: 'For AI agents', source: 'site/content/agents.md', site: true, summary: 'llms.txt, Markdown twins, AGENTS.md as the contract, how to ask for a plugin, the guides for using it in an app' },
].map((d) => ({ ...d, path: `/docs/${d.slug}/`, repo: d.site ? null : d.source }))

const DOC_BY_REPO = new Map(DOCS.filter((d) => d.repo).map((d) => [d.repo, d]))

/** Every page of the site; `twin` is the Markdown version. */
export const twinOf = (path) => (path === '/' ? '/index.md' : path.endsWith('/') ? path.slice(0, -1) + '.md' : null)

/** Output file for a page path. */
export const fileOf = (path) => (path.endsWith('/') ? `${path}index.html` : path).slice(1)

/** Relative URL from the page at `from` to `to` (both site paths). */
export function rel(from, to) {
  const fromDir = from.endsWith('/') ? from : posix.dirname(from) + '/'
  const [path, frag] = splitFragment(to)
  let r = posix.relative(fromDir, path)
  if (path.endsWith('/') && r && !r.endsWith('/')) r += '/'
  if (r === '') r = './'
  return frag === null ? r : `${r}#${frag}`
}

export const abs = (path) => SITE_URL + path

function splitFragment(url) {
  const i = url.indexOf('#')
  return i < 0 ? [url, null] : [url.slice(0, i), url.slice(i + 1)]
}

export function githubUrl(repoPath) {
  const full = join(ROOT, repoPath)
  const kind = existsSync(full) && statSync(full).isDirectory() ? 'tree' : 'blob'
  return `${REPO}/${kind}/${BRANCH}/${repoPath.replace(/\/$/, '')}`
}

const warnings = []
export const warn = (msg) => warnings.push(msg)
export const takeWarnings = () => warnings.splice(0)

/**
 * Map a link of a page's Markdown to a URL that works on the site.
 * - `/site/path` (site-authored content): relative to the page.
 * - relative paths in repo docs: resolved against the file's location in
 *   the repo; another doc becomes its site page, anything else a GitHub URL.
 * With `twin`, links to pages point at their Markdown versions.
 */
export function mapUrl(url, { from, repo = null, twin = false }) {
  if (!url || url.startsWith('#') || url.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(url)) return url
  const [path, frag] = splitFragment(url)
  let target
  if (path.startsWith('/')) target = path
  else if (repo) {
    const resolved = posix.normalize(posix.join(posix.dirname(repo), path))
    const doc = DOC_BY_REPO.get(resolved)
    if (!doc) {
      if (!existsSync(join(ROOT, resolved))) warn(`${from}: link to missing repo path ${resolved}`)
      return githubUrl(resolved) + (frag === null ? '' : `#${frag}`)
    }
    target = doc.path
  } else {
    warn(`${from}: relative link "${url}" in site-authored content (use a /site/path)`)
    return url
  }
  if (twin) target = twinOf(target) ?? target
  return rel(from, frag === null ? target : `${target}#${frag}`)
}

/** Transform plugin: rewrite link URLs of one page (see mapUrl). */
export const siteLinks = (opts) => ({
  name: 'site-links',
  transform(root) {
    visit(root, (n) => {
      if ((n.type === 'link' || n.type === 'image') && typeof n.url === 'string') n.url = mapUrl(n.url, opts)
    })
  },
})

/**
 * Rewrite the inline link targets of a Markdown source for its `.md` twin,
 * leaving code (fenced blocks and code spans) and everything else untouched.
 */
export function rewriteTwin(src, opts) {
  let fence = null
  return src
    .split('\n')
    .map((line) => {
      const f = /^ {0,3}(`{3,}|~{3,})/.exec(line)
      if (fence) {
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length && /^ {0,3}[`~]+\s*$/.test(line)) fence = null
        return line
      }
      if (f) {
        fence = f[1]
        return line
      }
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) => (i % 2 ? part : part.replace(/\]\(([^)\s]+)/g, (_, url) => `](${mapUrl(url, { ...opts, twin: true })}`)))
        .join('')
    })
    .join('\n')
}

/** Markdown instance for the build: plugins by id, entity table, highlighting. */
export function makeMarkdown(ids, { extra = [], highlighted = true, ...options } = {}) {
  return createMarkdown({
    plugins: [...pluginsFor(ids), ...extra],
    decodeEntity,
    highlight: highlighted ? highlight : undefined,
    ...options,
  })
}

export const DOC_PLUGINS = ['gfm', 'headings', 'math', 'container', 'deflist', 'mark']

export const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** A code fence longer than any backtick run in `text`. */
export const fenceFor = (text) => '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)))

const nf = new Map()
/** Number formatting: 11.04. */
export function num(n, digits = 1) {
  if (!nf.has(digits)) nf.set(digits, new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }))
  return nf.get(digits).format(n)
}

export const kb = (bytes, digits = 2) => `${num(bytes / 1024, digits)} KB`
