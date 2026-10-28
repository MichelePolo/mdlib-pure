// Public types: the AST and the plugin contracts.
//
// Node names follow mdast (https://github.com/syntax-tree/mdast) where
// possible, so the tree is familiar to anyone who used remark/unified.

import type { Block, BlockParser } from './block/parser.ts'
import type { InlineParser } from './inline/parser.ts'
import type { RenderContext, VChild } from './render/vnode.ts'

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

/** A place in the source (unist). `line` and `column` are 1-based. */
export interface Point {
  line: number
  column: number
  offset: number
}

/** Source range (unist): `end` is the point just after the node. */
export interface Position {
  start: Point
  end: Point
}

/** Any AST node. Core nodes are described below; plugins add their own types. */
export interface Node {
  type: string
  children?: Node[]
  /** Block nodes only, with the `positions` option. */
  position?: Position
  [prop: string]: unknown
}

export interface Parent extends Node {
  children: Node[]
}

export interface Root extends Parent { type: 'root' }
export interface Paragraph extends Parent { type: 'paragraph' }
export interface Heading extends Parent { type: 'heading'; depth: 1 | 2 | 3 | 4 | 5 | 6 }
export interface ThematicBreak extends Node { type: 'thematicBreak' }
export interface Blockquote extends Parent { type: 'blockquote' }
export interface List extends Parent {
  type: 'list'
  ordered: boolean
  /** First number of an ordered list, `null` for bullet lists. */
  start: number | null
  /** `true` when the list is loose (items separated by blank lines). */
  spread: boolean
}
export interface ListItem extends Parent { type: 'listItem'; spread: boolean }
export interface Code extends Node {
  type: 'code'
  /** First word of the info string. */
  lang: string | null
  /** Rest of the info string. */
  meta: string | null
  value: string
}
/** Raw HTML. `block: true` for HTML blocks, absent for inline HTML. */
export interface Html extends Node { type: 'html'; value: string; block?: boolean }
export interface Text extends Node { type: 'text'; value: string }
export interface Emphasis extends Parent { type: 'emphasis' }
export interface Strong extends Parent { type: 'strong' }
export interface InlineCode extends Node { type: 'inlineCode'; value: string }
/** Hard line break. Soft breaks are plain `\n` inside text nodes. */
export interface Break extends Node { type: 'break' }
export interface Link extends Parent { type: 'link'; url: string; title: string | null }
export interface Image extends Node { type: 'image'; url: string; title: string | null; alt: string }

/** A link reference definition (`[label]: url "title"`). */
export interface Reference {
  url: string
  title: string | null
}

// ---------------------------------------------------------------------------
// Plugin contracts
// ---------------------------------------------------------------------------

/**
 * Result of `BlockRule.start`: 0 = no match, 1 = container opened (keep trying
 * starts inside it), 2 = leaf opened or line otherwise fully handled (stop).
 */
export type StartResult = 0 | 1 | 2
/** Result of `BlockRule.continue`: 0 = matched, 1 = not matched, 2 = line fully consumed. */
export type ContinueResult = 0 | 1 | 2

/**
 * A block-level rule. A rule may define a block *type* (`continue` and
 * friends), a block *start* (`start`), or both.
 */
export interface BlockRule {
  /**
   * Rule name, used by `before`/`after` and to replace a rule. For rules with
   * `continue` it is also the block type (and default AST node type). A
   * start-only rule may open blocks of other types (`fencedCode` opens `code`).
   */
  name: string
  /** Place this rule's `start` before the start of the named rule. */
  before?: string
  /** Place this rule's `start` after the start of the named rule. */
  after?: string
  /**
   * Characters that can begin this block after indentation. Lets the parser
   * skip rules cheaply. Omit to have `start` tried on every line.
   */
  triggers?: string
  /** Try to open a block at the current position of the line. */
  start?(p: BlockParser, container: Block): StartResult
  /** Called on every line while the block is open. Defines a block type. */
  continue?(p: BlockParser, block: Block): ContinueResult
  /** Called once when the block is closed. */
  finalize?(p: BlockParser, block: Block): void
  /** Which child block types this block accepts. Default: none. */
  canContain?(type: string): boolean
  /** Whether text lines are appended to `block.content`. */
  acceptsLines?: boolean
  /** `'inline'`: `block.content` is parsed as inlines. `'block'`: child blocks become children. */
  content?: 'inline' | 'block'
}

/** An inline rule, dispatched on its trigger characters. */
export interface InlineRule {
  name: string
  /** Characters that activate the rule. */
  triggers: string
  before?: string
  after?: string
  /** Consume input at `p.pos` and return `true`, or return `false` without consuming. */
  parse(p: InlineParser): boolean
}

/**
 * A delimiter run handled by the emphasis algorithm (like `*`), e.g. `~~` for
 * strikethrough or `==` for highlight. Opener and closer must have the same
 * length, which must be one of `sizes`.
 */
export interface DelimiterRule {
  char: string
  /** AST node type created around the delimited content. */
  type: string
  sizes: number[]
}

export type RenderFn = (node: Node, r: RenderContext) => VChild | VChild[]

export interface TransformContext {
  /** Parse a string as inline content (for plugins building nodes from text). */
  parseInline(src: string): Node[]
  references: Map<string, Reference>
  /** Per-parse scratch space, shared with block and inline rules (`p.env`). */
  env: Record<string, unknown>
}

export interface Plugin {
  name: string
  block?: BlockRule[]
  inline?: InlineRule[]
  delimiters?: DelimiterRule[]
  /** Runs after parsing, in plugin order. May mutate the tree or return a new root. */
  transform?(root: Root, ctx: TransformContext): Root | void
  /** Render overrides keyed by node type. */
  render?: Record<string, RenderFn>
}
