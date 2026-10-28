// Page shell: head (metadata, Markdown twin, theme bootstrap), top bar, footer.
import { abs, escapeHtml, REPO, rel, twinOf } from './context.js'

export const NAV = [
  { path: '/docs/', label: 'Docs', section: 'docs' },
  { path: '/samples/', label: 'Samples', section: 'samples' },
  { path: '/plugins/', label: 'Plugins', section: 'plugins' },
  { path: '/playground/', label: 'Playground', section: 'playground' },
  { path: '/story/', label: 'Built with AI', section: 'story' },
  { path: '/docs/agents/', label: 'For AI agents', section: 'agents' },
]

/** Asset version, set by the build (cache busting for CSS/JS). */
export const assets = { version: 'dev' }
export const asset = (from, file) => `${rel(from, `/assets/${file}`)}?v=${assets.version}`

// Applies the stored colour scheme before first paint (no flash); see
// modern-web-guidance "dark-mode-toggle". CSS maps the <meta> to color-scheme.
const BOOT = `try{var s=localStorage.getItem('color-scheme');document.querySelector('meta[name="color-scheme"]').content=s==='light'||s==='dark'?s:'light dark'}catch(e){}document.documentElement.classList.add('js')`

export function schemeSelect(id = 'scheme') {
  return `<label class="scheme js-only" for="${id}"><span>Theme</span>
      <select id="${id}" data-scheme>
        <option value="light dark">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select></label>`
}

export function topBar(path, section) {
  const items = NAV.map((n) => {
    const current = n.section === section ? ' aria-current="page"' : ''
    return `<li><a href="${rel(path, n.path)}"${current}>${n.label}</a></li>`
  }).join('\n          ')
  return `<header class="bar">
    <a class="brand" href="${rel(path, '/')}"><span class="mk" aria-hidden="true">#</span>mdlib-pure</a>
    <nav class="site-nav" id="site-nav" popover aria-label="Site">
        <ul>
          ${items}
        </ul>
    </nav>
    <div class="bar-end">
      ${schemeSelect()}
      <button class="menu-btn" type="button" popovertarget="site-nav" aria-controls="site-nav">Menu</button>
    </div>
  </header>`
}

export function footer(path) {
  const twin = twinOf(path)
  return `<footer class="site-foot">
    <div class="wrap">
      <p class="credit">Designed and developed by Michele Polo with AI — built in collaboration with Claude (Anthropic) using Claude Code.</p>
      <ul>
        <li><a href="${REPO}/blob/main/LICENSE">MIT license</a></li>
        <li><a href="${REPO}">Source on GitHub</a></li>
        <li><a href="${rel(path, '/llms.txt')}">llms.txt</a></li>
        ${twin ? `<li><a href="${rel(path, twin)}" type="text/markdown">This page as Markdown</a></li>` : ''}
      </ul>
    </div>
  </footer>`
}

/**
 * A full HTML page. `body` is the content of <main>; `bare` skips the main
 * wrapper (the playground lays out its own).
 */
export function page({ path, section, title, description, body, head = '', scripts = [], bodyClass = '', jsonld = null, bare = false }) {
  const twin = twinOf(path)
  const fullTitle = path === '/' ? title : `${title} · mdlib-pure`
  const scriptTags = scripts.map((s) => (typeof s === 'string' ? `<script type="module" src="${s}"></script>` : `<script src="${s.src}"${s.defer ? ' defer' : ''}></script>`)).join('\n  ')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <script>${BOOT}</script>
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${abs(path)}">
  ${twin ? `<link rel="alternate" type="text/markdown" href="${rel(path, twin)}" title="Markdown version">` : ''}
  <link rel="alternate" type="text/plain" href="${rel(path, '/llms.txt')}" title="llms.txt">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="mdlib-pure">
  <meta property="og:locale" content="en_US">
  <meta property="og:title" content="${escapeHtml(fullTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${abs(path)}">
  <link rel="icon" href="${rel(path, '/favicon.svg')}" type="image/svg+xml">
  <link rel="preload" href="${rel(path, '/assets/katex/fonts/KaTeX_Main-Regular.woff2')}" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="${asset(path, 'theme.css')}">
  <link rel="stylesheet" href="${asset(path, 'site.css')}">
  ${head}
  ${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
  <script type="module" src="${asset(path, 'js/site.js')}"></script>
  ${scriptTags}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
  <a class="skip" href="#content">Skip to content</a>
  ${topBar(path, section)}
  ${bare ? body : `<main id="content" tabindex="-1">\n${body}\n  </main>`}
  ${footer(path)}
</body>
</html>
`
}
