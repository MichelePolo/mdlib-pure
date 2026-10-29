// Build the demonstration website into site/out/, or serve it.
//
//   node scripts/build-site.js            build (npm run site:build)
//   node scripts/build-site.js --serve    serve site/out on http://localhost:4173 (npm run site:serve)
//   SITE_URL=https://example.com/mdlib node scripts/build-site.js   absolute URLs for sitemap, llms.txt…
//
// Pages are rendered by mdlib-pure from src/ (Node runs the TypeScript
// directly); browser scripts are bundled from src/ with esbuild. No runtime
// dependency is added: KaTeX, React, Tailwind and esbuild are dev dependencies.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize, posix, relative, sep } from 'node:path'
import { build } from 'esbuild'
import { abs, BLAZOR_RELEASE, DOCS, fileOf, OUT, PKG, read, REPO, rewriteTwin, ROOT, SITE, SITE_URL, takeWarnings, twinOf } from '../site/build/context.js'
import { assets, page } from '../site/build/layout.js'
import { docs } from '../site/build/pages/docs.js'
import { home } from '../site/build/pages/home.js'
import { PLAYGROUND_SAMPLES, playground } from '../site/build/pages/playground.js'
import { plugins } from '../site/build/pages/plugins.js'
import { samples, TW_CLASSES } from '../site/build/pages/samples.js'
import { SHOTS_DIR, story } from '../site/build/pages/story.js'
import { measureAll } from '../site/build/sizes.js'

const args = process.argv.slice(2)
const PORT = Number(process.env.PORT ?? (args.includes('--port') ? args[args.indexOf('--port') + 1] : 4173))


async function buildSite() {
  const t0 = performance.now()
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(join(OUT, 'assets'), { recursive: true })

  // --- Static assets -----------------------------------------------------------
  copyFileSync(join(ROOT, 'styles/theme.css'), join(OUT, 'assets/theme.css'))
  copyFileSync(join(ROOT, 'styles/editor.css'), join(OUT, 'assets/editor.css'))
  copyFileSync(join(SITE, 'assets/site.css'), join(OUT, 'assets/site.css'))
  copyFileSync(join(SITE, 'assets/favicon.svg'), join(OUT, 'favicon.svg'))
  const katex = join(ROOT, 'node_modules/katex/dist')
  const katexOut = join(OUT, 'assets/katex')
  mkdirSync(join(katexOut, 'contrib'), { recursive: true })
  mkdirSync(join(katexOut, 'fonts'))
  for (const f of ['katex.min.css', 'katex.min.js', 'contrib/auto-render.min.js']) copyFileSync(join(katex, f), join(katexOut, f))
  copyFileSync(join(ROOT, 'node_modules/katex/LICENSE'), join(katexOut, 'LICENSE'))
  // Every browser of the Baseline 2024 target loads the woff2 files first.
  const katexFonts = readdirSync(join(katex, 'fonts')).filter((f) => f.endsWith('.woff2'))
  for (const f of katexFonts) copyFileSync(join(katex, 'fonts', f), join(katexOut, 'fonts', f))

  // --- Browser scripts (bundled from src/) --------------------------------------
  const samplesModule = {
    name: 'virtual-samples',
    setup(b) {
      b.onResolve({ filter: /^virtual:samples$/ }, () => ({ path: 'samples', namespace: 'virtual' }))
      b.onLoad({ filter: /.*/, namespace: 'virtual' }, () => ({
        contents: `export default ${JSON.stringify(PLAYGROUND_SAMPLES.map(({ id, title, plugins }) => ({ id, title, plugins, source: read(`site/content/samples/${id}.md`) })))}`,
        loader: 'js',
      }))
    },
  }
  const bundle = await build({
    entryPoints: { site: 'site/client/site.js', home: 'site/client/home.js', playground: 'site/client/playground.js' },
    absWorkingDir: ROOT,
    outdir: join(OUT, 'assets/js'),
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    metafile: true,
    plugins: [samplesModule],
  })
  await build({ entryPoints: ['site/client/katex-init.js'], absWorkingDir: ROOT, outfile: join(OUT, 'assets/js/katex-init.js'), bundle: true, format: 'iife', minify: true, target: 'es2022' })
  // The Web Components sample: src/element.ts (core and every plugin) in one
  // file of its own, so the other bundles and their chunks stay as they are.
  await build({ entryPoints: ['site/client/elements.js'], absWorkingDir: ROOT, outfile: join(OUT, 'assets/js/elements.js'), bundle: true, format: 'esm', platform: 'browser', minify: true, legalComments: 'none', target: 'es2022' })

  // --- Mermaid (dev dependency), split per diagram type, loaded on demand ------
  await build({ entryPoints: ['site/client/mermaid-init.js'], absWorkingDir: ROOT, outfile: join(OUT, 'assets/js/mermaid-init.js'), bundle: true, format: 'esm', minify: true, target: 'es2022' })
  await build({
    stdin: { contents: "export { default } from 'mermaid'", resolveDir: ROOT, loader: 'js' },
    absWorkingDir: ROOT,
    outdir: join(OUT, 'assets/mermaid'),
    entryNames: 'mermaid',
    chunkNames: 'chunks/[name]-[hash]',
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    logLevel: 'error',
  })
  copyFileSync(join(ROOT, 'node_modules/mermaid/LICENSE'), join(OUT, 'assets/mermaid/LICENSE'))

  // --- Tailwind sample: a real Tailwind CSS v4 build of the classes map ---------
  const tw = join(OUT, '.tailwind')
  mkdirSync(tw)
  const classes = Object.values(TW_CLASSES).join(' ')
  writeFileSync(
    join(tw, 'input.css'),
    `@layer theme, base, components, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities) source(none);\n@source inline("${classes}");\n`,
  )
  execFileSync(join(ROOT, 'node_modules/.bin/tailwindcss'), ['-i', join(tw, 'input.css'), '-o', join(OUT, 'assets/tailwind-sample.css'), '--minify'], { cwd: ROOT, stdio: 'pipe' })
  rmSync(tw, { recursive: true })

  // Asset version for cache busting: a hash of the CSS and the entry scripts.
  const hash = createHash('sha256')
  for (const f of ['assets/theme.css', 'assets/editor.css', 'assets/site.css', 'assets/tailwind-sample.css', 'assets/js/site.js', 'assets/js/home.js', 'assets/js/playground.js', 'assets/js/katex-init.js', 'assets/js/elements.js']) {
    hash.update(readFileSync(join(OUT, f)))
  }
  assets.version = hash.digest('hex').slice(0, 10)

  // --- Pages ------------------------------------------------------------------------
  const sizes = await measureAll()
  const llms = llmsTxt()
  const docsOut = docs()
  const storyOut = story()
  const pages = [
    home({ sizes, llmsHead: llms.split('\n').slice(0, 9).join('\n') }),
    ...docsOut.pages,
    samples(),
    plugins({ sizes, tocs: docsOut.tocs }),
    playground(),
    storyOut,
  ]
  // Docs and story twins are rewritten by their modules (they also map repo
  // paths); the other pages use site paths, pointed here at the twins.
  const rewritten = new Set([...docsOut.pages.map((p) => p.path), storyOut.path])
  for (const p of pages) {
    write(fileOf(p.path), p.html)
    const twin = twinOf(p.path)
    if (p.md) write(twin.slice(1), rewritten.has(p.path) ? p.md : rewriteTwin(p.md, { from: twin }))
  }
  mkdirSync(join(OUT, SHOTS_DIR), { recursive: true })
  for (const s of storyOut.shots) copyFileSync(join(ROOT, 'docs/screenshots', s.file), join(OUT, SHOTS_DIR, s.file))

  // --- For agents and crawlers -------------------------------------------------------
  write('llms.txt', llms)
  write('llms-full.txt', llmsFull(docsOut.pages))
  write('sitemap.xml', sitemap(pages))
  write('robots.txt', robots())
  write('404.html', notFound())
  write('playground/sw.js', serviceWorker(bundle.metafile, katexFonts))
  write('.nojekyll', '')

  const problems = [...takeWarnings(), ...checkDocsCoverage(), ...checkLinks()]
  const files = walk(OUT)
  const kb = (n) => `${(n / 1024).toFixed(0)} KB`
  console.log(`built ${relative(ROOT, OUT)}/: ${pages.length} pages, ${files.length} files, ${kb(files.reduce((n, f) => n + statSync(f).size, 0))} in ${((performance.now() - t0) / 1000).toFixed(1)} s`)
  console.log(`  SITE_URL ${SITE_URL}${process.env.SITE_URL ? '' : ' (default; set SITE_URL for another host)'}`)
  if (problems.length) {
    for (const p of problems) console.error(`✗ ${p}`)
    process.exitCode = 1
  }
}

function write(file, content) {
  const full = join(OUT, file)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))

// --- llms.txt (https://llmstxt.org) --------------------------------------------------

const DESCRIPTION =
  'Lightweight, zero-dependency Markdown renderer for the browser: 100% CommonMark 0.31.2 (652/652 spec examples), GitHub Flavored Markdown as an opt-in plugin (54/54 extension examples), an ~11 KB gzipped core, safe by default, linear time on any input. Extensible through plugins, styled with semantic CSS tokens, output as HTML, DOM, React/Preact/Vue elements, or the <mdlib-markdown> and <mdlib-editor> Web Components, which the MdlibPure.Blazor (.NET 10) and ngx-mdlib-pure (Angular) wrappers build on. Not on a package registry yet (no npm, no NuGet): the Install section of each guide says how to install it today.'

function llmsTxt() {
  const doc = (slug) => DOCS.find((d) => d.slug === slug)
  const link = (title, path, note) => `- [${title}](${abs(path)})${note ? `: ${note}` : ''}`
  const docLine = (slug) => link(doc(slug).title, twinOf(doc(slug).path), doc(slug).summary.replace(/`/g, ''))
  return `# mdlib-pure

> ${DESCRIPTION}

Every page of this site has a Markdown version at the same path with \`.md\`; the docs are the repository's own Markdown files. To extend the library, read AGENTS.md ("Extending: plugin guide") fully first: it is the contract for AI agents, and \`npm run verify\` must pass before a task is done. To use it in a page or an app, the guides are docs/elements.md (Web Components), bindings/blazor/README.md (Blazor) and bindings/angular/README.md (Angular). Nothing is published on npm or NuGet yet: never suggest \`npm install mdlib-pure\`; README.md (Install) gives the tarball URL on the GitHub release.

## Docs

${DOCS.filter((d) => d.slug !== 'changelog').map((d) => docLine(d.slug)).join('\n')}

## Examples

${link('Samples', '/samples.md', 'Markdown source and rendered output for CommonMark, GFM, math, Mermaid, definition lists, containers, mark, front matter, syntax highlighting, Tailwind classes and React, and a live <mdlib-editor> and <mdlib-markdown>')}
${link('Plugins', '/plugins.md', 'import path, gzip size, syntax and AST nodes of every first-party plugin, and the size of mdlib-pure/element')}
${link('Playground', '/playground.md', 'the live editor and what it can do')}

## Optional

${docLine('changelog')}
- [mdlib-pure 0.1.0 release](${REPO}/releases/tag/mdlib-pure-v0.1.0): the npm tarball (not on the npm registry)
- [ngx-mdlib-pure 0.1.0 release](${REPO}/releases/tag/angular-v0.1.0): the npm tarball of the Angular wrapper (not on the npm registry)
- [MdlibPure.Blazor 0.1.0 release](${BLAZOR_RELEASE}): the .nupkg of the Blazor wrapper (not on nuget.org)
${link('Built with AI', '/story.md', 'how the library was built with AI agents, from the git history')}
${link('Home', '/index.md', 'overview, ways to use it (JavaScript, Web Components, React/Preact/Vue, Blazor, Angular), datasheet and benchmark')}
${link('All docs in one file', '/llms-full.txt')}
- [Source repository](${REPO}): README.md, AGENTS.md, docs/, src/, templates/plugin, bindings/blazor, bindings/angular
`
}

function llmsFull(docPages) {
  const parts = DOCS.map((d) => {
    const p = docPages.find((x) => x.path === d.path)
    return `<!-- ${d.title}: ${abs(d.path)} (source: ${d.site ? 'written for the site' : d.source}) -->\n\n${p.md.trim()}\n`
  })
  return `# mdlib-pure: full documentation

> ${DESCRIPTION}

This file concatenates the documentation pages of ${abs('/')}: the repository's ${list(DOCS.filter((d) => !d.site).map((d) => d.source))}, plus the site's page for AI agents. Version ${PKG.version}.

${parts.join('\n---\n\n')}`
}

const list = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`)

function sitemap(pages) {
  const today = new Date().toISOString().slice(0, 10)
  const urls = pages.map((p) => `  <url><loc>${abs(p.path)}</loc><lastmod>${today}</lastmod></url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
}

function robots() {
  const bots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bytespider', 'Meta-ExternalAgent']
  return `# Crawlers and AI agents are welcome.
# Agents: start at ${abs('/llms.txt')} (index) or ${abs('/llms-full.txt')} (all docs).
# Every page has a Markdown version at the same path with .md.

User-agent: *
Allow: /

${bots.map((b) => `User-agent: ${b}`).join('\n')}
Allow: /

Sitemap: ${abs('/sitemap.xml')}
`
}

function notFound() {
  const base = new URL(`${SITE_URL}/`).pathname
  const html = page({
    path: '/404.html',
    section: '',
    title: 'Page not found',
    description: 'This page does not exist.',
    head: '<meta name="robots" content="noindex">',
    body: `
    <header class="page-head wrap">
      <h1 class="title"><span class="mk" aria-hidden="true">#</span>Page not found</h1>
      <p class="lede">Nothing lives at this address. The documentation starts at <a href="docs/">the docs overview</a>, and agents can find every page in <a href="llms.txt">llms.txt</a>.</p>
      <p class="actions"><a class="btn btn-primary" href="./">Go to the home page</a></p>
    </header>`,
  })
  // Served at any path: resolve links from the site root.
  return html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <base href="${base}" data-site-base>`)
}

function serviceWorker(metafile, fonts) {
  const v = assets.version
  const chunks = Object.keys(metafile.outputs)
    .map((f) => posix.relative('site/out/assets/js', f.split(sep).join('/')))
    .filter((f) => f.startsWith('chunks/') && f.endsWith('.js'))
  const urls = [
    './',
    `../assets/theme.css?v=${v}`,
    `../assets/site.css?v=${v}`,
    `../assets/js/site.js?v=${v}`,
    `../assets/js/playground.js?v=${v}`,
    ...chunks.map((c) => `../assets/js/${c}`),
    '../favicon.svg',
    '../assets/katex/katex.min.css',
    '../assets/katex/katex.min.js',
    '../assets/katex/contrib/auto-render.min.js',
    ...fonts.map((f) => `../assets/katex/fonts/${f}`),
  ]
  return `// Offline support for the playground: precache on install, then network
// first with the cache as fallback (so updates show up when online).
const CACHE = 'mdlib-pure-playground-${v}'
const PRECACHE = ${JSON.stringify(urls, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mdlib-pure-playground-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(async () => (await caches.match(request)) ?? (request.mode === 'navigate' ? await caches.match('./') : Response.error())),
  )
})
`
}

// --- Docs coverage: every guide of the repository is a docs page ------------------
//
// AGENTS.md rule 10: the site, llms.txt and llms-full.txt are generated from
// docs/*.md and bindings/*/README.md, so a guide added there without a DOCS
// entry (site/build/context.js) would silently be missing from the site.
// docs/ is scanned recursively, so a guide in a subfolder is caught too.

/** Markdown files under docs/ that are not guides, with the reason. */
const NOT_GUIDES = new Map([
  // The index of docs/screenshots/: one caption per PNG. It is published in
  // another form: its table is the gallery of the story page (pages/story.js).
  ['docs/screenshots/README.md', 'screenshot captions, published as the gallery of /story/'],
])

function checkDocsCoverage() {
  const published = new Set(DOCS.map((d) => d.source))
  const repoPath = (f) => relative(ROOT, f).split(sep).join('/')
  const bindings = join(ROOT, 'bindings')
  const guides = [
    ...walk(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map(repoPath),
    ...(existsSync(bindings) ? readdirSync(bindings).map((d) => `bindings/${d}/README.md`).filter((f) => existsSync(join(ROOT, f))) : []),
  ]
  return guides
    .filter((f) => !published.has(f) && !NOT_GUIDES.has(f))
    .map((f) => `${f} is not published on the site: add it to DOCS in site/build/context.js (if it is not a guide, to NOT_GUIDES in scripts/build-site.js, with the reason)`)
}

// --- Internal link check ---------------------------------------------------------

function checkLinks() {
  const problems = []
  const ids = new Map()
  const idsOf = (file) => {
    if (!ids.has(file)) ids.set(file, new Set([...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => decodeEntities(m[1]))))
    return ids.get(file)
  }
  for (const file of walk(OUT).filter((f) => f.endsWith('.html') && !f.endsWith('404.html'))) {
    const html = readFileSync(file, 'utf8')
    // Skip text inside <pre>/<code> and <template> is still real markup: only attributes are checked.
    for (const m of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      const url = decodeEntities(m[1])
      if (!url || /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith('//')) continue
      const [pathPart, frag] = url.split('#')
      const path = pathPart.split('?')[0]
      let target = path ? normalize(join(dirname(file), decodeURIComponent(path))) : file
      if (!target.startsWith(OUT)) {
        problems.push(`${relative(OUT, file)}: link outside the site: ${url}`)
        continue
      }
      if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html')
      if (!existsSync(target)) {
        problems.push(`${relative(OUT, file)}: broken link ${url}`)
        continue
      }
      // `#key=value` is application state (the playground), not an anchor.
      if (frag && !frag.includes('=') && target.endsWith('.html') && !idsOf(target).has(decodeURIComponent(frag))) problems.push(`${relative(OUT, file)}: missing anchor ${url}`)
    }
  }
  return problems
}

function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e])
}

// --- Static server ---------------------------------------------------------------------

function serve() {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.xml': 'application/xml; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  }
  const base = new URL(`${SITE_URL}/`).pathname
  createServer((req, res) => {
    let pathname
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    } catch {
      res.writeHead(400).end('Bad request')
      return
    }
    let file = normalize(join(OUT, pathname))
    if (!file.startsWith(OUT)) {
      res.writeHead(403).end('Forbidden')
      return
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: `${pathname}/` }).end()
        return
      }
      file = join(file, 'index.html')
    }
    const headers = { 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }
    if (!existsSync(file) || !statSync(file).isFile()) {
      const html = readFileSync(join(OUT, '404.html'), 'utf8').replace(`<base href="${base}" data-site-base>`, '<base href="/" data-site-base>')
      res.writeHead(404, { ...headers, 'Content-Type': types['.html'] }).end(req.method === 'HEAD' ? undefined : html)
      return
    }
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
    res.end(req.method === 'HEAD' ? undefined : readFileSync(file))
  }).listen(PORT, () => console.log(`serving ${relative(ROOT, OUT)}/ on http://localhost:${PORT}/`))
}

// --- Entry point (last: functions above use module-level constants) -------------

if (args.includes('--serve')) {
  if (!existsSync(join(OUT, 'index.html'))) await buildSite()
  serve()
} else {
  await buildSite()
}
