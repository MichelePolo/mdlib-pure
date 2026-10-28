// Playground: the demo editor (top bar, Markdown on the left, live preview on
// the right) with samples, plugin toggles, Preview/HTML/AST tabs, theme,
// sharing through the URL hash, and offline support (service worker).
import { PLUGINS } from '../../lib/plugins.js'
import { SAMPLES, WELCOME } from '../../lib/samples.js'
import { escapeHtml, fenceFor, makeMarkdown, read, rel } from '../context.js'
import { asset, page } from '../layout.js'

const PATH = '/playground/'

export const PLAYGROUND_SAMPLES = [WELCOME, ...SAMPLES.filter((s) => s.playground !== false)]

export function playground() {
  const source = read(`site/content/samples/${WELCOME.id}.md`)
  const md = makeMarkdown(WELCOME.plugins)
  const options = PLAYGROUND_SAMPLES.map((s) => `<option value="${s.id}">${escapeHtml(s.title)}</option>`).join('')
  const toggles = PLUGINS.filter((p) => p.playground !== false).map(
    (p) => `<label class="check"><input type="checkbox" name="plugin" value="${p.id}"${WELCOME.plugins.includes(p.id) ? ' checked' : ''}> <span><strong>${escapeHtml(p.label)}</strong> <small>${escapeHtml(p.hint)}</small></span></label>`,
  ).join('\n            ')

  const body = `<main id="content" class="pg" tabindex="-1" data-katex-base="${rel(PATH, '/assets/katex/')}">
    <h1 class="visually-hidden">mdlib-pure playground</h1>
    <div class="pg-tools">
      <label class="pg-field" for="pg-sample"><span>Sample</span>
        <select id="pg-sample">${options}<option value="">Your text</option></select></label>
      <button type="button" class="pg-btn js-only" id="pg-plugins-btn" popovertarget="pg-plugins">Plugins <span id="pg-plugin-count">(${WELCOME.plugins.length})</span></button>
      <div id="pg-plugins" class="pg-pop" popover>
        <fieldset>
          <legend>Plugins</legend>
            ${toggles}
        </fieldset>
        <fieldset>
          <legend>Options</legend>
          <label class="check"><input type="checkbox" id="pg-highlight" checked> <span><strong>Highlight code</strong> <small>the <code>highlight</code> option, with this site's tokenizer</small></span></label>
        </fieldset>
      </div>
      <button type="button" class="pg-btn js-only" id="pg-share">Share</button>
      <span class="pg-status" id="pg-status" role="status"></span>
      <span class="pg-count" id="pg-count"></span>
    </div>
    <div class="pg-panes">
      <section class="pg-pane pg-left" aria-labelledby="pg-src-label">
        <p class="pane-label" id="pg-src-label">Markdown</p>
        <textarea id="src" aria-labelledby="pg-src-label" spellcheck="false">${escapeHtml(source)}</textarea>
      </section>
      <section class="pg-pane pg-right" aria-label="Output">
        <div class="pg-tabs" role="tablist" aria-label="Output view">
          <button type="button" role="tab" id="tab-preview" aria-controls="panel-preview" aria-selected="true">Preview</button>
          <button type="button" role="tab" id="tab-html" aria-controls="panel-html" aria-selected="false" tabindex="-1">HTML</button>
          <button type="button" role="tab" id="tab-ast" aria-controls="panel-ast" aria-selected="false" tabindex="-1">AST</button>
        </div>
        <div class="pg-panel md" id="panel-preview" role="tabpanel" aria-labelledby="tab-preview" tabindex="0">${md.render(source)}</div>
        <div class="pg-panel pg-code md" id="panel-html" role="tabpanel" aria-labelledby="tab-html" tabindex="0" hidden><pre><code class="language-html"></code></pre></div>
        <div class="pg-panel pg-code md" id="panel-ast" role="tabpanel" aria-labelledby="tab-ast" tabindex="0" hidden><pre><code class="language-json"></code></pre></div>
      </section>
    </div>
    <noscript><p class="pg-noscript">The playground needs JavaScript. The preview above was rendered when the site was built.</p></noscript>
  </main>`

  const html = page({
    path: PATH,
    section: 'playground',
    title: 'Playground',
    description: 'Try mdlib-pure in the browser: Markdown on the left, live preview on the right, plugin toggles, HTML and AST views, sharable links, works offline.',
    body,
    bare: true,
    bodyClass: 'app',
    scripts: [asset(PATH, 'js/playground.js')],
  })

  const fence = fenceFor(source)
  const twin = `# Playground

An editor with a live preview: Markdown on the left, the output of mdlib-pure
on the right, rendered in the browser as you type.

- **Samples**: ${PLAYGROUND_SAMPLES.map((s) => s.title).join(', ')}.
- **Plugins** to toggle: ${PLUGINS.filter((p) => p.playground !== false).map((p) => `${p.label} (${p.hint})`).join('; ')}; plus the \`highlight\` option.
- **Views**: Preview (\`renderTo()\`), HTML (\`render()\`), AST (\`parse()\`).
- **Theme**: system, light or dark.
- **Share**: the source and the settings are compressed into the URL hash (\`#v1=…\`); \`#sample=<id>\` opens a sample.
- **Offline**: a service worker keeps the playground available without a network.

The playground opens with this text:

${fence}markdown
${source}${fence}
`
  return { path: PATH, html, md: twin }
}
