// mdlib-pure — public entry point.

import { type Block, BlockParser } from './block/parser.ts'
import { coreBlockRules } from './block/rules.ts'
import { type InlineConfig, InlineParser } from './inline/parser.ts'
import { coreInlineRules } from './inline/rules.ts'
import { hasRaw, toDom } from './render/dom.ts'
import { toHtml } from './render/html.ts'
import { coreRenderers, createRenderer } from './render/renderer.ts'
import type { UrlKind, VChild } from './render/vnode.ts'
import type { BlockRule, DelimiterRule, InlineRule, Node, Plugin, Reference, RenderFn, Root, TransformContext } from './types.ts'
import { trimMd } from './util/common.ts'
import { defaultEntityDecoder, type EntityDecoder } from './util/entities.ts'
import { isSafeUrl } from './util/url.ts'

export interface Options {
  plugins?: Plugin[]
  /**
   * Allow raw HTML in the source. Default `false`: HTML is not recognized and
   * shows up as text. Enable only for trusted input, or together with `sanitize`.
   */
  html?: boolean
  /** Sanitizer applied to the final HTML string (e.g. `DOMPurify.sanitize`). */
  sanitize?: (html: string) => string
  /** URL policy for href/src. Default: `isSafeUrl`. */
  allowUrl?: (url: string, kind: UrlKind) => boolean
  /** Named entity decoder. Default: DOM-based; use `mdlib-pure/entities` outside browsers. */
  decodeEntity?: EntityDecoder
  /** CSS classes per node type, e.g. `{ paragraph: 'my-4', heading1: 'text-3xl' }`. */
  classes?: Record<string, string>
}

export interface Markdown {
  /** Markdown → AST. */
  parse(src: string): Root
  /** Markdown (or AST) → HTML string. */
  render(src: string | Root): string
  /** Render into an element. Builds DOM nodes directly unless raw HTML is present. */
  renderTo(el: Element, src: string | Root): void
  /** Markdown (or AST) → VNodes, for custom serializers. */
  toVNodes(src: string | Root): VChild[]
}

type Ordered = { name: string; before?: string; after?: string }

/**
 * Merge plugin rules into the core list. A rule with the name of an existing
 * rule replaces it; `before`/`after` position it relative to another rule.
 */
function order<T extends Ordered>(core: T[], extra: T[], disabled: Set<string>): T[] {
  const list = [...core]
  for (const rule of extra) {
    const existing = list.findIndex((r) => r.name === rule.name)
    const anchor = rule.before ?? rule.after
    if (anchor === undefined) {
      if (existing >= 0) list[existing] = rule
      else list.push(rule)
      continue
    }
    if (existing >= 0) list.splice(existing, 1)
    const i = list.findIndex((r) => r.name === anchor)
    if (i < 0) throw new Error(`mdlib-pure: rule "${rule.name}" is positioned relative to unknown rule "${anchor}"`)
    list.splice(rule.before ? i : i + 1, 0, rule)
  }
  return list.filter((r) => !disabled.has(r.name))
}

const escapeClass = (chars: string): string => chars.replace(/[\\\]^-]/g, '\\$&')

export function createMarkdown(options: Options = {}): Markdown {
  const plugins = options.plugins ?? []
  const disabled = new Set(options.html ? [] : ['htmlBlock', 'htmlInline'])
  const decodeEntity = options.decodeEntity ?? defaultEntityDecoder

  // Block rules: those with `continue` define types, those with `start` open blocks.
  const blockRules = order<BlockRule>(coreBlockRules, plugins.flatMap((p) => p.block ?? []), disabled)
  const types = new Map(blockRules.filter((r) => r.continue).map((r) => [r.name, r]))
  const starts = blockRules.filter((r) => r.start)

  // Inline rules, indexed by trigger character.
  const delimiterRules: DelimiterRule[] = plugins.flatMap((p) => p.delimiters ?? [])
  const inlineRules = order<InlineRule>(
    coreInlineRules,
    [
      ...plugins.flatMap((p) => p.inline ?? []),
      ...delimiterRules.map((d) => ({ name: `delimiter:${d.char}`, triggers: d.char, parse: (p: InlineParser) => p.handleDelim(p.peek()) })),
    ],
    disabled,
  )
  const byChar = new Map<number, InlineRule[]>()
  for (const rule of inlineRules) {
    for (const ch of rule.triggers) {
      const code = ch.charCodeAt(0)
      const list = byChar.get(code)
      if (list) list.push(rule)
      else byChar.set(code, [rule])
    }
  }
  const delimiters = new Map<number, DelimiterRule | null>([
    [42, null],
    [95, null],
  ])
  for (const d of delimiterRules) delimiters.set(d.char.charCodeAt(0), d)
  const triggers = String.fromCharCode(...byChar.keys())
  const inlineConfig: InlineConfig = { rules: byChar, delimiters, reText: new RegExp(`[^${escapeClass(triggers)}]+`, 'y'), decodeEntity }

  const toAst = (b: Block, inline: InlineParser): Node => {
    const node = b.node
    const content = types.get(b.type)?.content
    if (content === 'inline') node.children = inline.parse(trimMd(b.content))
    else if (content === 'block') node.children = b.children.map((c) => toAst(c, inline))
    return node
  }

  function parse(src: string): Root {
    const refs = new Map<string, Reference>()
    const inline = new InlineParser(inlineConfig, refs)
    const doc = new BlockParser(types, starts, inline, refs).parse(src)
    let root = toAst(doc, inline) as Root
    const ctx: TransformContext = { parseInline: (s) => inline.parse(s), references: refs }
    for (const p of plugins) if (p.transform) root = p.transform(root, ctx) ?? root
    return root
  }

  const renderers: Record<string, RenderFn> = Object.assign({}, coreRenderers, ...plugins.map((p) => p.render ?? {}))
  const renderTree = createRenderer({ renderers, classes: options.classes, allowUrl: options.allowUrl ?? isSafeUrl })
  const toVNodes = (src: string | Root): VChild[] => renderTree(typeof src === 'string' ? parse(src) : src)
  const sanitize = options.sanitize ?? ((s: string) => s)

  return {
    parse,
    toVNodes,
    render: (src) => sanitize(toHtml(toVNodes(src))),
    renderTo(el, src) {
      const tree = toVNodes(src)
      if (hasRaw(tree)) {
        // Raw HTML fragments may be partial tags (`<span>` … `</span>`), so they
        // can only be parsed as a whole document fragment.
        el.innerHTML = sanitize(toHtml(tree)) // check:allow-innerHTML
      } else {
        el.replaceChildren(toDom(tree, el.ownerDocument))
      }
    },
  }
}

export type * from './types.ts'
export type { Block, BlockParser } from './block/parser.ts'
export type { InlineParser } from './inline/parser.ts'
export type { Props, RenderContext, UrlKind, VChild, VElement, VRaw } from './render/vnode.ts'
export type { EntityDecoder } from './util/entities.ts'
export { MAX_NESTING } from './block/parser.ts'
export { h, raw } from './render/vnode.ts'
export { toHtml } from './render/html.ts'
export { toDom } from './render/dom.ts'
export { coreRenderers } from './render/renderer.ts'
export { isSafeUrl } from './util/url.ts'
export { normalizeLabel, normalizeUrl } from './util/normalize.ts'
export { escapeHtml } from './util/common.ts'
