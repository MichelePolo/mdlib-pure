// Small HTML parts shared by the pages.
import { escapeHtml, fenceFor, makeMarkdown, rel } from '../context.js'
import { asset } from '../layout.js'

const code = makeMarkdown([])

/** Markdown source next to its rendered output (`stack`: source above it). */
export function pair(source, output, { math = false, label = 'Result', outAttrs = '', cls = 'md pane-out', srcLabel = 'Markdown', srcLang = 'markdown', stack = false } = {}) {
  return `<div class="pair${stack ? ' pair-stack' : ''}">
        <div class="pane pane-src"><p class="pane-label">${srcLabel}</p><pre><code class="language-${srcLang}">${escapeHtml(source)}</code></pre></div>
        <div class="pane"><p class="pane-label">${label}</p><div class="${cls}"${math ? ' data-katex' : ''}${outAttrs}>${output}</div></div>
      </div>`
}

/** A highlighted code block with a caption. */
export function codeBlock(lang, text, caption) {
  const fence = fenceFor(text)
  return `<div class="extra"><p class="pane-label">${caption}</p><div class="md">${code.render(`${fence}${lang}\n${text}\n${fence}\n`)}</div></div>`
}

/** KaTeX (copied from its dist into the output) and the auto-render call. */
export const katexHead = (path) => `<link rel="stylesheet" href="${rel(path, '/assets/katex/katex.min.css')}">
  <script defer src="${rel(path, '/assets/katex/katex.min.js')}"></script>
  <script defer src="${rel(path, '/assets/katex/contrib/auto-render.min.js')}"></script>
  <script defer src="${asset(path, 'js/katex-init.js')}"></script>`
