// Mermaid diagrams, without depending on Mermaid.
//
//   import { mermaid, renderMermaid } from 'mdlib-pure/mermaid'
//   const md = createMarkdown({ plugins: [mermaid()] })
//   md.renderTo(el, src)
//   const stop = await renderMermaid(el, { load: () => import('mermaid') })
//
// Syntax: fenced code blocks with the info string `mermaid` (as on GitHub and
// GitLab); other code blocks are untouched.
//
// AST: `mermaid { value }` replaces the `code` node.
// HTML: <pre class="mermaid">SOURCE</pre>, the markup Mermaid looks for: a
// page already running Mermaid needs nothing else, and without JavaScript
// (print, agents, feeds) the diagram source stays readable.
//
// renderMermaid(root, options):
// - calls `options.load()` only if `root` contains diagrams (Mermaid is
//   hundreds of KB: pages without diagrams pay nothing);
// - uses securityLevel 'strict' unless told otherwise ('sandbox' isolates
//   each diagram in an iframe: consider it for untrusted input);
// - an invalid diagram keeps its source, with the class `mermaid-error`;
// - theme 'tokens' (default) maps the --md-* tokens, flattened onto the real
//   page background, to Mermaid's `base` theme, and re-renders when the
//   color scheme changes (media query, class/style/data-* on <html>, or the
//   content of <meta name="color-scheme">).
//   Call the returned function to stop watching.
//
// options.render(source): pre-rendered output, e.g. SVG made at build time.
// A string is trusted HTML, VNodes are safe, null/undefined keeps the default.

import type { VChild } from '../render/vnode.ts'
import type { Code, Node, Plugin } from '../types.ts'
import { visit } from '../util/visit.ts'

export interface MermaidNode extends Node {
  type: 'mermaid'
  value: string
}

export interface MermaidOptions {
  render?: (source: string) => string | VChild | VChild[] | null
}

/** The part of Mermaid's API this module uses. */
export interface MermaidLike {
  initialize(config: Record<string, unknown>): void
  parse(text: string, options?: { suppressErrors?: boolean }): Promise<unknown>
  run(options: { nodes: ArrayLike<HTMLElement>; suppressErrors?: boolean }): Promise<void>
}

export interface RenderMermaidOptions {
  /** Load Mermaid, e.g. `() => import('mermaid')`. Called only when needed. */
  load: () => Promise<MermaidLike | { default: MermaidLike }>
  /** `'tokens'` (default): colors from the --md-* tokens; or a Mermaid theme name. */
  theme?: string
  /** Default `'strict'`. */
  securityLevel?: 'strict' | 'sandbox' | 'antiscript' | 'loose'
  /** Extra `mermaid.initialize()` settings (win over the ones above). */
  config?: Record<string, unknown>
  /** Re-render on color scheme changes. Default: true with theme `'tokens'`. */
  watch?: boolean
}

/** Block-level syntax never sits inside these: no need to descend. */
const LEAF = new Set(['paragraph', 'heading', 'table', 'html'])

export function mermaid(options: MermaidOptions = {}): Plugin {
  return {
    name: 'mermaid',
    transform(root) {
      visit(root, (n, parent, i) => {
        if (n.type === 'code' && (n as Code).lang === 'mermaid' && parent) {
          parent.children![i] = { type: 'mermaid', value: (n as Code).value }
        }
        return !LEAF.has(n.type)
      })
    },
    render: {
      mermaid(n, r) {
        const source = n.value as string
        const out = options.render?.(source)
        if (out === null || out === undefined || out === false) return r.h('pre', { class: 'mermaid' }, source)
        return r.h('div', { class: 'mermaid-diagram' }, typeof out === 'string' ? r.raw(out) : out)
      },
    },
  }
}

// --- Browser helper ------------------------------------------------------------

type RGBA = [number, number, number, number]

let ctx: CanvasRenderingContext2D | null = null

/** Any CSS color (oklab, color-mix results, system colors…) as sRGB bytes + alpha. */
function toRGBA(css: string): RGBA {
  ctx ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!ctx) return [0, 0, 0, 1]
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = css
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2], d[3] / 255]
}

const hex = (c: RGBA): string => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Composite a possibly translucent color onto an opaque background. */
const over = (c: RGBA, bg: RGBA): RGBA => [0, 1, 2].map((i) => c[i] * c[3] + bg[i] * (1 - c[3])).concat(1) as RGBA

/** Mermaid `base` theme variables from the tokens in effect at `el`. */
function tokenTheme(el: HTMLElement): Record<string, string | boolean> {
  const probe = document.createElement('span')
  el.append(probe)
  const style = getComputedStyle(probe)
  // Background layers up the tree until an opaque one, composited from the
  // outside in, over the canvas color of the color scheme.
  const layers: RGBA[] = []
  for (let n: Element | null = el; n; n = n.parentElement) {
    const c = toRGBA(getComputedStyle(n).backgroundColor)
    if (c[3] > 0) layers.push(c)
    if (c[3] >= 1) break
  }
  probe.style.backgroundColor = 'Canvas'
  let bg = over(toRGBA(style.backgroundColor), [255, 255, 255, 1])
  for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg)
  const color = (css: string): string => {
    probe.style.color = css
    return hex(over(toRGBA(style.color), bg))
  }
  const text = color('inherit')
  const vars = {
    darkMode: 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2] < 128,
    background: hex(bg),
    // Mermaid's default label background is black: use the page background.
    edgeLabelBackground: hex(bg),
    fontFamily: getComputedStyle(el).fontFamily,
    textColor: text,
    primaryTextColor: text,
    primaryColor: color('var(--md-color-code-bg)'),
    primaryBorderColor: color('var(--md-color-link)'),
    secondaryColor: color('var(--md-color-surface)'),
    tertiaryColor: color('var(--md-color-surface)'),
    lineColor: color('var(--md-color-muted)'),
    noteBkgColor: color('var(--md-color-mark)'),
    noteTextColor: text,
    noteBorderColor: color('var(--md-color-border)'),
  }
  probe.remove()
  return vars
}

const sources = new WeakMap<Element, string>()

export async function renderMermaid(root: ParentNode, options: RenderMermaidOptions): Promise<() => void> {
  const nodes = [...root.querySelectorAll<HTMLElement>('pre.mermaid')]
  if (!nodes.length) return () => {}
  const mod = await options.load()
  const m: MermaidLike = 'default' in mod ? mod.default : mod
  const theme = options.theme ?? 'tokens'
  let drawn = ''

  const draw = async (): Promise<void> => {
    const vars = theme === 'tokens' ? tokenTheme(nodes[0].parentElement ?? nodes[0]) : null
    const key = JSON.stringify(vars ?? theme)
    if (key === drawn) return // nothing changed (e.g. an unrelated class on <html>)
    drawn = key
    m.initialize({
      startOnLoad: false,
      securityLevel: options.securityLevel ?? 'strict',
      suppressErrorRendering: true,
      theme: vars ? 'base' : theme,
      ...(vars && { themeVariables: vars }),
      ...options.config,
    })
    const valid: HTMLElement[] = []
    for (const node of nodes) {
      // Keep the source: Mermaid replaces it with the SVG, and redraws need it.
      const source = sources.get(node) ?? node.textContent ?? ''
      sources.set(node, source)
      node.removeAttribute('data-processed')
      node.textContent = source
      const ok = await m.parse(source, { suppressErrors: true })
      node.classList.toggle('mermaid-error', !ok)
      if (ok) valid.push(node)
    }
    if (valid.length) await m.run({ nodes: valid, suppressErrors: true })
  }

  // Serialize redraws: a theme toggled twice quickly must not interleave runs.
  let queue = draw()
  await queue
  if (!(options.watch ?? theme === 'tokens')) return () => {}
  const redraw = (): void => {
    queue = queue.then(draw, draw)
  }
  const media = matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', redraw)
  const observer = new MutationObserver(redraw)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-scheme', 'data-color-scheme'] })
  // Sites may switch schemes through <meta name="color-scheme" content="…">.
  const meta = document.querySelector('meta[name="color-scheme"]')
  if (meta) observer.observe(meta, { attributes: true, attributeFilter: ['content'] })
  return () => {
    media.removeEventListener('change', redraw)
    observer.disconnect()
  }
}
