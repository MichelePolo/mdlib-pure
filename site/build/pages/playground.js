// Playground: the demo editor (top bar, Markdown on the left, live preview on
// the right) with samples, plugin toggles, Preview/HTML/AST tabs, theme,
// sharing through the URL hash, and offline support (service worker).
import { COMMANDS } from '../../lib/editor-commands.js'
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

  const body = `<main id="content" class="pg" data-mode="split" lang="it" tabindex="-1" data-katex-base="${rel(PATH, '/assets/katex/')}">
    <div class="editor-heading"><div><h1>Il tuo documento, in Markdown.</h1><p>Scrivi, esplora i plugin e porta il risultato con te.</p></div><span class="editor-badge">mdlib-pure / live editor</span></div>
    <div class="editor-commandbar">
      <label class="editor-name">Documento <input id="pg-name" value="Il mio documento" maxlength="100" aria-label="Nome documento"></label>
      <div class="editor-modes" role="group" aria-label="Modalità editor">
        <button type="button" data-mode="write" aria-pressed="false">Scrivi</button>
        <button type="button" data-mode="split" aria-pressed="true">Split</button>
        <button type="button" data-mode="read" aria-pressed="false">Leggi</button>
      </div>
      <div class="editor-exports" role="group" aria-label="Esporta documento">
        <button type="button" data-export="md" title="Scarica Markdown">↓ MD</button>
        <button type="button" data-export="html" title="Scarica HTML">↓ HTML</button>
        <button type="button" data-export="pdf" title="Stampa o salva come PDF">↓ PDF</button>
      </div>
    </div>
    <div class="editor-ribbon" role="group" aria-label="Formattazione Markdown">
      <div class="editor-group"><span>Cronologia</span><div><button type="button" id="pg-undo" aria-label="Annulla" title="Annulla (Ctrl+Z)">↶</button><button type="button" id="pg-redo" aria-label="Ripeti" title="Ripeti (Ctrl+Shift+Z)">↷</button></div></div>
      ${[...new Set(COMMANDS.map(c => c.group))].map(group => `<div class="editor-group"><span>${group}</span><div>${COMMANDS.filter(c => c.group === group).map(c => `<button type="button" data-command="${c.id}" title="${escapeHtml(c.label)}" aria-label="${escapeHtml(c.label)}"><svg viewBox="0 0 32 24" aria-hidden="true" focusable="false"><text x="16" y="17" text-anchor="middle" fill="currentColor">${escapeHtml(c.icon)}</text></svg></button>`).join('')}</div></div>`).join('')}
    </div>
    <div class="pg-tools">
      <label class="pg-field" for="pg-sample"><span>Esempio</span>
        <select id="pg-sample">${options}<option value="">Il tuo testo</option></select></label>
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
      <button type="button" class="pg-btn js-only" id="pg-share">Condividi</button>
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
          <button type="button" role="tab" id="tab-preview" aria-controls="panel-preview" aria-selected="true">Anteprima</button>
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
    title: 'Editor Markdown',
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
- **Editor modes**: Scrivi (write), Split (default), Leggi (read). Icon buttons insert all core and first-party plugin markers, enabling the required plugin automatically. Undo/redo and keyboard shortcuts are included.\n- **Export**: MD, styled HTML (math stylesheet uses this site), PDF through the browser print dialog (choose Save as PDF).\n- **Views**: Preview (\`renderTo()\`), HTML (\`render()\`), AST (\`parse()\`).
- **Theme**: system, light or dark.
- **Share**: the source and the settings are compressed into the URL hash (\`#v1=…\`); \`#sample=<id>\` opens a sample.
- **Offline**: a service worker keeps the playground available without a network.

The playground opens with this text:

${fence}markdown
${source}${fence}
`
  return { path: PATH, html, md: twin }
}
