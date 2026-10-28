// AST → VNodes. Each node type maps to a render function; plugins and users
// override them by type. Output of the core renderers matches the CommonMark
// reference HTML exactly.

import type { Code, Heading, Image, Link, List, Node, RenderFn } from '../types.ts'
import { h, type Props, raw, type RenderContext, type UrlKind, type VChild, type VElement } from './vnode.ts'

export const coreRenderers: Record<string, RenderFn> = {
  root: (n, r) => r.children(n),
  // In tight lists, paragraphs are rendered without <p>.
  paragraph: (n, r) => (r.parent?.type === 'listItem' && !r.parent.spread ? r.children(n) : h('p', null, r.children(n))),
  heading: (n, r) => h(`h${(n as Heading).depth}`, null, r.children(n)),
  thematicBreak: () => h('hr'),
  blockquote: (n, r) => h('blockquote', null, r.children(n)),
  list(n, r) {
    const { ordered, start } = n as List
    return h(ordered ? 'ol' : 'ul', ordered && start !== null && start !== 1 ? { start } : null, r.children(n))
  },
  listItem: (n, r) => h('li', null, r.children(n)),
  code(n) {
    const { lang, value } = n as Code
    return h('pre', null, h('code', lang ? { class: `language-${lang}` } : null, value))
  },
  html: (n, r) => r.raw(n.value as string, n.block === true),
  text: (n) => n.value as string,
  emphasis: (n, r) => h('em', null, r.children(n)),
  strong: (n, r) => h('strong', null, r.children(n)),
  inlineCode: (n) => h('code', null, n.value as string),
  break: () => h('br'),
  link(n, r) {
    const { url, title } = n as Link
    return h('a', { href: r.url(url, 'link'), title }, r.children(n))
  },
  image(n, r) {
    const { url, alt, title } = n as Image
    return h('img', { src: r.url(url, 'image'), alt, title })
  },
}

export interface RendererOptions {
  renderers: Record<string, RenderFn>
  /** Extra CSS classes per node type (`heading1`…`heading6` for heading levels). */
  classes?: Record<string, string>
  /** Extra attributes for the element a node renders to (merged; `class` is appended). */
  attributes?: (node: Node) => Props | null | undefined
  allowUrl(url: string, kind: UrlKind): boolean
}

const toArray = (v: VChild | VChild[]): VChild[] => (Array.isArray(v) ? v : [v])
const own = (map: Record<string, string>, key: string): string | undefined => (Object.hasOwn(map, key) ? map[key] : undefined)

function addProps(out: VChild | VChild[], props: Props | null | undefined): void {
  if (!props || !out || typeof out !== 'object' || Array.isArray(out) || !('tag' in out)) return
  const { class: cls, ...rest } = props
  out.props = { ...out.props, ...rest }
  if (typeof cls === 'string') addClass(out, cls)
}

function addClass(out: VChild | VChild[], cls: string | undefined): void {
  if (!cls || !out || typeof out !== 'object' || Array.isArray(out) || !('tag' in out)) return
  const el = out as VElement
  const prev = el.props?.class
  el.props = { ...el.props, class: prev ? `${prev} ${cls}` : cls }
}

export function createRenderer(opts: RendererOptions): (root: Node) => VChild[] {
  const { renderers, classes, attributes, allowUrl } = opts

  const renderNode = (node: Node): VChild | VChild[] => {
    const fn = Object.hasOwn(renderers, node.type) ? renderers[node.type] : undefined
    // Unknown node types degrade gracefully: their children or their text.
    const out = fn ? fn(node, ctx) : node.children ? ctx.children(node) : typeof node.value === 'string' ? node.value : null
    if (attributes) addProps(out, attributes(node))
    if (classes) {
      addClass(out, own(classes, node.type))
      if (node.type === 'heading') addClass(out, own(classes, `heading${node.depth}`))
    }
    return out
  }

  const ctx: RenderContext = {
    h,
    raw,
    parent: null,
    url: (url, kind) => (allowUrl(url, kind) ? url : ''),
    children(node) {
      const out: VChild[] = []
      const saved = ctx.parent
      ctx.parent = node
      for (const child of node.children ?? []) {
        const r = renderNode(child)
        if (Array.isArray(r)) out.push(...r)
        else out.push(r)
      }
      ctx.parent = saved
      return out
    },
    render: (node) => toArray(renderNode(node)),
  }

  return (root) => toArray(renderNode(root))
}
