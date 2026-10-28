// Render the mermaid plugin's <pre class="mermaid"> blocks. Mermaid itself is
// loaded from this site's assets only on pages that have diagrams.
import { renderMermaid } from '../../src/plugins/mermaid.ts'

const load = () => import(new URL('../mermaid/mermaid.js', import.meta.url).href)

for (const el of document.querySelectorAll('[data-mermaid]')) renderMermaid(el, { load })
