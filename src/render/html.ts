// VNode → HTML string.
//
// Line breaks follow the CommonMark reference renderer: a newline goes
// before and after block elements, and inside container elements after
// the opening and before the closing tag. A newline is never doubled.

import { escapeHtml } from '../util/common.ts'
import type { Props, VChild } from './vnode.ts'

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])

const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'caption', 'dd', 'details', 'dialog', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'td', 'tfoot',
  'th', 'thead', 'tr', 'ul',
])

/** Block elements whose content starts on a new line. */
const CONTAINER = new Set([
  'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figure', 'footer', 'header',
  'main', 'nav', 'ol', 'section', 'table', 'tbody', 'tfoot', 'thead', 'tr', 'ul',
])

function attrs(props: Props | null): string {
  let s = ''
  if (props) {
    for (const key in props) {
      const v = props[key]
      if (v === null || v === undefined || v === false) continue
      s += v === true ? ` ${key}` : ` ${key}="${escapeHtml(String(v))}"`
    }
  }
  return s
}

export function toHtml(nodes: VChild[]): string {
  let out = ''
  let last = '\n' // last emitted char; tracked to avoid reading back a growing string
  const emit = (s: string): void => {
    if (s) {
      out += s
      last = s[s.length - 1]
    }
  }
  const cr = (): void => {
    if (last !== '\n') emit('\n')
  }
  const walk = (c: VChild): void => {
    if (c === null || c === undefined || c === false) return
    if (typeof c === 'string') return emit(escapeHtml(c))
    if ('raw' in c) {
      if (c.block) cr()
      emit(c.raw)
      if (c.block) cr()
      return
    }
    const block = BLOCK.has(c.tag)
    if (block) cr()
    if (VOID.has(c.tag)) {
      emit(`<${c.tag}${attrs(c.props)} />`)
      if (block || c.tag === 'br') cr()
      return
    }
    emit(`<${c.tag}${attrs(c.props)}>`)
    const container = CONTAINER.has(c.tag)
    if (container) cr()
    for (const child of c.children) walk(child)
    if (container) cr()
    emit(`</${c.tag}>`)
    if (block) cr()
  }
  for (const n of nodes) walk(n)
  return out
}
