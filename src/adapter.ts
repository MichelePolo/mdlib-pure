// VNodes → elements of a UI framework, through its own `h`/createElement.
//
//   import { createElement } from 'react'
//   import { toElements } from 'mdlib-pure/adapter'
//   <article className="md">{toElements(md.toVNodes(src), createElement, 'react')}</article>
//
//   import { h } from 'vue'           → toElements(vnodes, h, 'vue')
//   import { h } from 'preact'        → toElements(vnodes, h, 'preact')
//
// Presets handle each framework's conventions: React attribute names,
// uncontrolled checkboxes, empty `src`; Vue's array children; raw HTML via
// dangerouslySetInnerHTML (React, Preact) or innerHTML (Vue), wrapped in a
// <div> (block) or <span> (inline).
//
// Raw HTML is only present with `html: true` or a string-returning
// `highlight`. If the instance has `sanitize`, `md.toVNodes()` has already
// passed every raw node through it. With `html: true`, inline HTML arrives as
// separate fragments (`<b>`, text, `</b>`), which cannot be rendered as
// framework elements: for that case use `md.render()` on a container.

import type { VChild } from './render/vnode.ts'

export type Preset = 'react' | 'preact' | 'vue'

export type CreateElement<T> = (tag: string, props: Record<string, unknown> | null, ...children: any[]) => T

const REACT_NAMES = new Map([
  ['class', 'className'],
  ['for', 'htmlFor'],
  ['tabindex', 'tabIndex'],
  ['readonly', 'readOnly'],
  ['colspan', 'colSpan'],
  ['rowspan', 'rowSpan'],
  ['checked', 'defaultChecked'], // uncontrolled: no "checked without onChange" warning
])

const BOOLEAN = new Set(['checked', 'disabled', 'open', 'hidden', 'readonly'])

/** Convert VNodes to framework elements. Top-level elements get a `key`. */
export function toElements<T>(nodes: VChild[], h: CreateElement<T>, preset: Preset = 'react'): Array<T | string> {
  const react = preset === 'react'
  const vue = preset === 'vue'

  const convert = (c: VChild, key?: number): T | string | null => {
    if (c === null || c === undefined || c === false) return null
    if (typeof c === 'string') return c
    if ('raw' in c) {
      // Raw nodes only exist for HTML the caller declared trusted (`html: true`
      // or a `highlight` string); `md.toVNodes()` applies `sanitize` to each.
      const props: Record<string, unknown> = vue ? { innerHTML: c.raw } : { dangerouslySetInnerHTML: { __html: c.raw } } // check:allow-innerHTML
      if (key !== undefined) props.key = key
      return h(c.block ? 'div' : 'span', props)
    }
    const props: Record<string, unknown> = {}
    if (key !== undefined) props.key = key
    for (const name in c.props) {
      let value: unknown = c.props[name]
      if (value === null || value === undefined || value === false) continue
      if (BOOLEAN.has(name) && value === '') value = true
      // Presence attributes (`data-footnote-ref`): frameworks would print "true".
      else if (value === true && !BOOLEAN.has(name)) value = ''
      // React 19 warns on empty `src` (and `href` outside <a>) and drops them;
      // `<a href="">` is valid (CommonMark `[x]()`) and kept.
      if (react && value === '' && (name === 'src' || (name === 'href' && c.tag !== 'a'))) continue
      props[react ? (REACT_NAMES.get(name) ?? name) : name] = value
    }
    const children: Array<T | string> = []
    for (const child of c.children) {
      const el = convert(child)
      if (el !== null) children.push(el)
    }
    // Vue takes children as one array; React/Preact as arguments (no key warnings).
    return vue ? h(c.tag, props, children) : h(c.tag, props, ...children)
  }

  const out: Array<T | string> = []
  nodes.forEach((n, i) => {
    const el = convert(n, i)
    if (el !== null) out.push(el)
  })
  return out
}
