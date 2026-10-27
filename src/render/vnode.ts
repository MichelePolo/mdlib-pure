// Virtual nodes: the framework-neutral output of render functions.
//
// Render functions build VNodes with `h(tag, props, ...children)`. The tree is
// then serialized to an HTML string (html.ts) or built as DOM (dom.ts).
// Text children are plain strings and are escaped by the serializer.

import type { Node } from '../types.ts'

export type Props = Record<string, string | number | boolean | null | undefined>

export interface VElement {
  tag: string
  props: Props | null
  children: VChild[]
}

/** Trusted raw HTML. `block: true` puts it on its own lines. */
export interface VRaw {
  raw: string
  block: boolean
}

export type VChild = string | VElement | VRaw | null | undefined | false

export function h(tag: string, props?: Props | null, ...children: Array<VChild | VChild[]>): VElement {
  return { tag, props: props ?? null, children: children.flat() }
}

export function raw(html: string, block = false): VRaw {
  return { raw: html, block }
}

export type UrlKind = 'link' | 'image'

/** Passed to every render function. */
export interface RenderContext {
  h: typeof h
  raw: typeof raw
  /** Render the children of `node`. */
  children(node: Node): VChild[]
  /** Render any node with the configured renderers. */
  render(node: Node): VChild[]
  /** Parent of the node being rendered (`null` for the root). */
  parent: Node | null
  /** Pass a URL through the `allowUrl` policy. Returns `''` when rejected. */
  url(url: string, kind: UrlKind): string
}
