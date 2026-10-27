// VNode → DOM, without any HTML parsing.
//
// Text goes through createTextNode and attributes through setAttribute, so
// markdown content can never become markup here. Trees containing raw HTML
// (VRaw) cannot be built this way: callers must check `hasRaw` first.

import type { VChild } from './vnode.ts'

export function hasRaw(nodes: VChild[]): boolean {
  for (const c of nodes) {
    if (!c || typeof c === 'string') continue
    if ('raw' in c) return true
    if (hasRaw(c.children)) return true
  }
  return false
}

export function toDom(nodes: VChild[], doc: Document = document): DocumentFragment {
  const fragment = doc.createDocumentFragment()
  const walk = (c: VChild, parent: globalThis.Node): void => {
    if (c === null || c === undefined || c === false) return
    if (typeof c === 'string') {
      parent.appendChild(doc.createTextNode(c))
      return
    }
    if ('raw' in c) throw new Error('mdlib-pure: raw HTML cannot be built as DOM; render it as a string instead')
    const el = doc.createElement(c.tag)
    if (c.props) {
      for (const key in c.props) {
        const v = c.props[key]
        if (v === null || v === undefined || v === false) continue
        el.setAttribute(key, v === true ? '' : String(v))
      }
    }
    for (const child of c.children) walk(child, el)
    parent.appendChild(el)
  }
  for (const n of nodes) walk(n, fragment)
  return fragment
}
