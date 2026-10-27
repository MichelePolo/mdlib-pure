// GitHub Flavored Markdown: tables, strikethrough, extended autolinks, task
// lists, footnotes, the disallowed raw HTML filter, and GitHub alerts.
//
//   import { gfm } from 'mdlib-pure/gfm'
//   createMarkdown({ plugins: gfm() })
//
// Each extension is also exported on its own.

import type { Node, Plugin } from '../types.ts'
import { autolink } from './autolink.ts'
import { footnotes } from './footnotes.ts'
import { table } from './table.ts'

export { autolink } from './autolink.ts'
export { footnotes } from './footnotes.ts'
export { type Align, table } from './table.ts'

/** `~~text~~` or `~text~` → `delete` (`<del>`). */
export const strikethrough = (): Plugin => ({
  name: 'gfm-strikethrough',
  delimiters: [{ char: '~', type: 'delete', sizes: [1, 2] }],
  render: { delete: (n, r) => r.h('del', null, r.children(n)) },
})

/**
 * `- [ ] todo` / `- [x] done`: sets `listItem.checked` and puts a
 * `taskCheckbox` node at the start of the item's first paragraph.
 */
export const tasklist = (): Plugin => ({
  name: 'gfm-tasklist',
  transform(root) {
    const walk = (node: Node): void => {
      for (const child of node.children ?? []) {
        if (child.type === 'listItem') {
          const para = child.children?.[0]
          const text = para?.type === 'paragraph' ? para.children?.[0] : undefined
          const m = text?.type === 'text' ? /^\[([ xX])\](?=[ \t\n]|$)/.exec(text.value as string) : null
          if (m && para && text) {
            child.checked = m[1] !== ' '
            text.value = (text.value as string).slice(3)
            para.children!.unshift({ type: 'taskCheckbox', checked: child.checked })
          }
        }
        walk(child)
      }
    }
    walk(root)
  },
  render: {
    taskCheckbox: (n, r) => r.h('input', { type: 'checkbox', checked: n.checked ? '' : null, disabled: '' }),
  },
})

const reDisallowed = /<(\/?)(title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)(?=[\s/>]|$)/gi

/** With `html: true`, neutralize tags GitHub never allows (`<script>`, `<iframe>`…). */
export const tagfilter = (): Plugin => ({
  name: 'gfm-tagfilter',
  transform(root) {
    const walk = (node: Node): void => {
      for (const child of node.children ?? []) {
        if (child.type === 'html') child.value = (child.value as string).replace(reDisallowed, '&lt;$1$2')
        else walk(child)
      }
    }
    walk(root)
  },
})

const ALERTS = ['note', 'tip', 'important', 'warning', 'caution'] as const
const reAlert = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i

/** GitHub alerts: a blockquote starting with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` or `[!CAUTION]`. */
export const alerts = (): Plugin => ({
  name: 'gfm-alerts',
  transform(root) {
    const walk = (node: Node): void => {
      const children = node.children ?? []
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (child.type === 'blockquote') {
          const para = child.children?.[0]
          const text = para?.type === 'paragraph' ? para.children?.[0] : undefined
          const m = text?.type === 'text' ? reAlert.exec(text.value as string) : null
          if (m && para && text) {
            text.value = (text.value as string).slice(m[0].length)
            if (text.value === '') para.children!.shift()
            if (para.children!.length === 0) child.children!.shift()
            children[i] = { type: 'alert', kind: m[1].toLowerCase(), children: child.children }
          }
        }
        walk(children[i])
      }
    }
    walk(root)
  },
  render: {
    alert(n, r) {
      const kind = n.kind as (typeof ALERTS)[number]
      const title = kind[0].toUpperCase() + kind.slice(1)
      return r.h('div', { class: `markdown-alert markdown-alert-${kind}` }, r.h('p', { class: 'markdown-alert-title' }, title), r.children(n))
    },
  },
})

export interface GfmOptions {
  table?: boolean
  strikethrough?: boolean
  autolink?: boolean
  tasklist?: boolean
  footnotes?: boolean
  tagfilter?: boolean
  alerts?: boolean
}

/** All GFM extensions (each can be turned off). */
export function gfm(options: GfmOptions = {}): Plugin[] {
  const on = (key: keyof GfmOptions): boolean => options[key] !== false
  const list: Plugin[] = []
  if (on('table')) list.push(table())
  if (on('strikethrough')) list.push(strikethrough())
  if (on('autolink')) list.push(autolink())
  if (on('tasklist')) list.push(tasklist())
  if (on('footnotes')) list.push(footnotes())
  if (on('tagfilter')) list.push(tagfilter())
  if (on('alerts')) list.push(alerts())
  return list
}
