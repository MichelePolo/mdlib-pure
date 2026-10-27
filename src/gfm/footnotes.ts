// GitHub footnotes: references `[^label]` and definitions `[^label]: text`
// (a container: continuation lines are indented 4 spaces).
//
// AST (mdast): footnoteReference { identifier, label, index, occurrence },
// footnoteDefinition { identifier, label, index, references, children }.
// The transform numbers definitions by first reference, drops unreferenced
// ones and moves the rest into a trailing `footnotes` node. HTML output
// matches cmark-gfm.

import { MAX_NESTING } from '../block/parser.ts'
import type { VChild, VElement } from '../render/vnode.ts'
import type { BlockRule, InlineRule, Node, Plugin, RenderFn } from '../types.ts'
import { normalizeLabel, normalizeUrl } from '../util/normalize.ts'

interface FootnoteEnv {
  /** Normalized label → label as written in the definition. */
  defined: Map<string, string>
}

const envOf = (env: Record<string, unknown>): FootnoteEnv =>
  (env.footnotes ??= { defined: new Map() } as FootnoteEnv) as FootnoteEnv

// Labels are bounded like link labels (999 chars): an unbounded scan makes
// "[^[^[^…" quadratic.
const reDefinition = /^\[\^([^\]\s]{1,999})\]:/

const definitionRule: BlockRule = {
  name: 'footnoteDefinition',
  triggers: '[',
  content: 'block',
  canContain: (t) => t !== 'listItem',
  continue(p) {
    if (p.indent >= 4) p.advanceOffset(4, true)
    else if (p.blank) p.advanceNextNonspace()
    else return 1
    return 0
  },
  start(p, container) {
    if (p.indented || container.depth >= MAX_NESTING) return 0
    const m = reDefinition.exec(p.rest())
    if (!m) return 0
    p.advanceNextNonspace()
    p.advanceOffset(m[0].length)
    // Spaces after the marker are skipped: the content is not indented code.
    p.findNextNonspace()
    p.advanceNextNonspace()
    p.closeUnmatchedBlocks()
    const b = p.addChild('footnoteDefinition', p.nextNonspace)
    const identifier = normalizeLabel(m[1])
    b.node.identifier = identifier
    b.node.label = m[1]
    const { defined } = envOf(p.env)
    if (!defined.has(identifier)) defined.set(identifier, m[1])
    else b.node.duplicate = true
    return 1
  },
}

const referenceRule: InlineRule = {
  name: 'footnoteReference',
  // Also `!`: in "text![^1]" the image rule would otherwise take "![".
  triggers: '[!',
  before: 'openBracket',
  parse(p) {
    const bang = p.peek() === 33 /* ! */ ? 1 : 0
    if (p.peek(bang) !== 91 /* [ */ || p.peek(bang + 1) !== 94 /* ^ */) return false
    const start = p.pos
    p.pos += bang
    const m = p.match(/\[\^([^\]\s]{1,999})\]/y)
    const identifier = m ? normalizeLabel(m.slice(2, -1)) : ''
    const label = m ? envOf(p.env).defined.get(identifier) : undefined
    if (label === undefined) {
      p.pos = start
      return false
    }
    if (bang) p.text('!')
    p.push({ type: 'footnoteReference', identifier, label })
    return true
  },
}

function transform(root: Node): void {
  // 1. Detach definitions (first one wins for duplicate labels).
  const defs = new Map<string, Node>()
  const detach = (node: Node): void => {
    const children = node.children
    if (!children) return
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child.type === 'footnoteDefinition') {
        children.splice(i--, 1)
        if (!child.duplicate) defs.set(child.identifier as string, child)
      }
      detach(child)
    }
  }
  detach(root)

  // 2. Number definitions by first reference, in document order; references
  //    inside definitions are found when those are scanned in turn.
  const ordered: Node[] = []
  const number = (node: Node): void => {
    for (const child of node.children ?? []) {
      if (child.type === 'footnoteReference') {
        const def = defs.get(child.identifier as string)
        if (!def) continue
        if (def.index === undefined) {
          def.index = ordered.length + 1
          def.references = 0
          ordered.push(def)
        }
        def.references = (def.references as number) + 1
        child.index = def.index
        child.occurrence = def.references
      } else {
        number(child)
      }
    }
  }
  number(root)
  for (let i = 0; i < ordered.length; i++) number(ordered[i])

  if (ordered.length) root.children!.push({ type: 'footnotes', children: ordered })
}

const refId = (label: string, n: number): string => `fnref-${normalizeUrl(label)}${n > 1 ? `-${n}` : ''}`

const renderReference: RenderFn = (n, r) =>
  r.h(
    'sup',
    { class: 'footnote-ref' },
    r.h('a', { href: `#fn-${normalizeUrl(n.label as string)}`, id: refId(n.label as string, n.occurrence as number), 'data-footnote-ref': true }, String(n.index)),
  )

const renderDefinition: RenderFn = (n, r) => {
  const label = n.label as string
  const backrefs: VChild[] = []
  for (let k = 1; k <= (n.references as number); k++) {
    const idx = k > 1 ? `${n.index}-${k}` : String(n.index)
    backrefs.push(
      ' ',
      r.h(
        'a',
        { href: `#${refId(label, k)}`, class: 'footnote-backref', 'data-footnote-backref': true, 'data-footnote-backref-idx': idx, 'aria-label': `Back to reference ${idx}` },
        '↩',
        k > 1 ? r.h('sup', { class: 'footnote-ref' }, String(k)) : null,
      ),
    )
  }
  const content = r.children(n)
  const last = content[content.length - 1] as VElement | undefined
  // Backrefs go inside a trailing paragraph, otherwise after the content.
  if (last && typeof last === 'object' && 'tag' in last && last.tag === 'p') last.children.push(...backrefs)
  else content.push(...backrefs.slice(1))
  return r.h('li', { id: `fn-${normalizeUrl(label)}` }, content)
}

export const footnotes = (): Plugin => ({
  name: 'gfm-footnotes',
  block: [definitionRule],
  inline: [referenceRule],
  transform,
  render: {
    footnoteReference: renderReference,
    footnoteDefinition: renderDefinition,
    footnotes: (n, r) => r.h('section', { class: 'footnotes', 'data-footnotes': true }, r.h('ol', null, r.children(n))),
  },
})
