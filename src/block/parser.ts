// Block parser: phase 1 of parsing.
//
// Lines are consumed one at a time. Each open block is asked whether the line
// continues it (`continue`); then block starts are tried (`start`); whatever
// remains is text, appended to the deepest open leaf or to a new paragraph.
// The algorithm follows the CommonMark spec appendix and commonmark.js.

import type { BlockRule, Node, Reference } from '../types.ts'

export const CODE_INDENT = 4
/**
 * Maximum nesting of container blocks (and, in the inline parser, of
 * emphasis/links). Beyond it, markers are treated as text. Keeps adversarial
 * input from exhausting the call stack in tree walks.
 */
export const MAX_NESTING = 100

/** A block under construction. Becomes an AST node once parsing is done. */
export class Block {
  type: string
  parent: Block | null = null
  children: Block[] = []
  open = true
  /** Number of ancestors (root = 0). */
  depth = 0
  startLine: number
  endLine: number
  /** Raw text accumulated by leaf blocks (paragraph, code, html...). */
  content = ''
  /** The AST node this block becomes. Rules set its properties. */
  node: Node
  /** Private per-rule state (fence length, list marker...). Not part of the AST. */
  data: Record<string, any> = {}

  constructor(type: string, startLine: number) {
    this.type = type
    this.startLine = startLine
    this.endLine = startLine
    this.node = { type }
  }

  get lastChild(): Block | undefined {
    return this.children[this.children.length - 1]
  }

  /** Remove this block from its parent. */
  remove(): void {
    const siblings = this.parent?.children
    if (siblings) siblings.splice(siblings.indexOf(this), 1)
    this.parent = null
  }

  /** Put `other` where this block is, and detach this block. */
  replaceWith(other: Block): void {
    const siblings = this.parent?.children
    if (siblings) siblings[siblings.indexOf(this)] = other
    other.parent = this.parent
    other.depth = this.depth
    this.parent = null
  }
}

/** Inline-level services the block parser needs (implemented by InlineParser). */
export interface ReferenceParser {
  parseReference(src: string, refs: Map<string, Reference>): number
  unescape(src: string): string
}

export class BlockParser {
  // --- Current line state, read and advanced by rules -----------------------
  line = ''
  lineNumber = 0
  /** Position in `line` (code units). */
  offset = 0
  /** Visual column at `offset`, with tabs expanded to multiples of 4. */
  column = 0
  nextNonspace = 0
  nextNonspaceColumn = 0
  /** Columns of indentation from `column` to `nextNonspace`. */
  indent = 0
  /** `indent >= 4`: the line would be indented code. */
  indented = false
  blank = false
  partiallyConsumedTab = false
  /** False while some open blocks did not match the current line yet. */
  allClosed = true
  private scannedLine = -1
  private scannedFrom = 0

  // --- Tree state -----------------------------------------------------------
  doc!: Block
  /** Deepest open block. */
  tip!: Block
  oldtip!: Block
  lastMatchedContainer!: Block
  readonly refs: Map<string, Reference>

  private readonly types: Map<string, BlockRule>
  private readonly starts: BlockRule[]
  private readonly maybeSpecial: RegExp | null
  private readonly refParser: ReferenceParser

  constructor(types: Map<string, BlockRule>, starts: BlockRule[], refParser: ReferenceParser, refs: Map<string, Reference>) {
    this.types = types
    this.starts = starts
    this.refParser = refParser
    this.refs = refs
    // Fast path: if every start declares its trigger characters, a
    // non-indented line starting with anything else cannot open a block.
    const triggers = starts.every((s) => s.triggers !== undefined) ? starts.map((s) => s.triggers).join('') : null
    this.maybeSpecial = triggers === null ? null : new RegExp(`^[${triggers.replace(/[\\\]^-]/g, '\\$&')}]`)
  }

  parse(src: string): Block {
    this.doc = new Block('root', 1)
    this.tip = this.oldtip = this.lastMatchedContainer = this.doc
    this.lineNumber = 0
    this.scannedLine = -1
    this.offset = this.column = 0
    this.line = ''
    const lines = src.split(/\r\n|\n|\r/)
    let len = lines.length
    // A final line ending does not start a new (empty) line.
    if (/[\r\n]$/.test(src)) len--
    for (let i = 0; i < len; i++) this.incorporateLine(lines[i])
    for (let b: Block | null = this.tip; b; b = b.parent) this.finalize(b, len)
    return this.doc
  }

  // --- Helpers for rules ----------------------------------------------------

  /** Char code at `pos` in the current line, or -1. */
  peek(pos: number): number {
    return pos < this.line.length ? this.line.charCodeAt(pos) : -1
  }

  /** The current line from the first non-space character. */
  rest(): string {
    return this.line.slice(this.nextNonspace)
  }

  rule(type: string): BlockRule {
    const rule = this.types.get(type)
    if (!rule) throw new Error(`mdlib-pure: unknown block type "${type}"`)
    return rule
  }

  /** Parse link reference definitions at the start of `src`; returns chars consumed. */
  parseReference(src: string): number {
    return this.refParser.parseReference(src, this.refs)
  }

  /** Resolve backslash escapes and entities (e.g. in code info strings). */
  unescape(src: string): string {
    return this.refParser.unescape(src)
  }

  findNextNonspace(): void {
    // Still inside the whitespace scanned last time: the next non-space is
    // unchanged. Avoids rescanning the indentation once per nested container.
    if (this.scannedLine === this.lineNumber && this.offset >= this.scannedFrom && this.offset <= this.nextNonspace) {
      this.indent = this.nextNonspaceColumn - this.column
      this.indented = this.indent >= CODE_INDENT
      return
    }
    this.scannedLine = this.lineNumber
    this.scannedFrom = this.offset
    const line = this.line
    let i = this.offset
    let cols = this.column
    let c = ''
    while ((c = line.charAt(i)) !== '') {
      if (c === ' ') {
        i++
        cols++
      } else if (c === '\t') {
        i++
        cols += 4 - (cols % 4)
      } else break
    }
    this.blank = c === '' || c === '\n' || c === '\r'
    this.nextNonspace = i
    this.nextNonspaceColumn = cols
    this.indent = cols - this.column
    this.indented = this.indent >= CODE_INDENT
  }

  advanceNextNonspace(): void {
    this.offset = this.nextNonspace
    this.column = this.nextNonspaceColumn
    this.partiallyConsumedTab = false
  }

  /** Advance by `count` characters, or by `count` columns if `columns` (tabs may be split). */
  advanceOffset(count: number, columns = false): void {
    const line = this.line
    let c: string | undefined
    while (count > 0 && (c = line[this.offset])) {
      if (c === '\t') {
        const charsToTab = 4 - (this.column % 4)
        if (columns) {
          this.partiallyConsumedTab = charsToTab > count
          const charsToAdvance = charsToTab > count ? count : charsToTab
          this.column += charsToAdvance
          this.offset += this.partiallyConsumedTab ? 0 : 1
          count -= charsToAdvance
        } else {
          this.partiallyConsumedTab = false
          this.column += charsToTab
          this.offset += 1
          count -= 1
        }
      } else {
        this.partiallyConsumedTab = false
        this.offset += 1
        this.column += 1
        count -= 1
      }
    }
  }

  /** Append the rest of the current line to the tip's content. */
  addLine(): void {
    if (this.partiallyConsumedTab) {
      this.offset += 1 // skip over the tab and add the remaining columns as spaces
      this.tip.content += ' '.repeat(4 - (this.column % 4))
    }
    this.tip.content += this.line.slice(this.offset) + '\n'
  }

  /** Open a new block of `type` as a child of the tip, closing blocks that cannot contain it. */
  addChild(type: string, _offset: number): Block {
    while (!this.rule(this.tip.type).canContain?.(type)) this.finalize(this.tip, this.lineNumber - 1)
    const block = new Block(type, this.lineNumber)
    block.depth = this.tip.depth + 1
    block.parent = this.tip
    this.tip.children.push(block)
    this.tip = block
    return block
  }

  /** Close every block that did not match the current line. */
  closeUnmatchedBlocks(): void {
    if (this.allClosed) return
    while (this.oldtip !== this.lastMatchedContainer) {
      const parent = this.oldtip.parent!
      this.finalize(this.oldtip, this.lineNumber - 1)
      this.oldtip = parent
    }
    this.allClosed = true
  }

  finalize(block: Block, lineNumber: number): void {
    const parent = block.parent // the rule may remove the block from the tree
    block.open = false
    block.endLine = lineNumber
    this.rule(block.type).finalize?.(this, block)
    if (parent) this.tip = parent
  }

  // --- Main loop ------------------------------------------------------------

  private incorporateLine(ln: string): void {
    let container = this.doc
    this.oldtip = this.tip
    this.offset = 0
    this.column = 0
    this.blank = false
    this.partiallyConsumedTab = false
    this.lineNumber += 1
    if (ln.indexOf('\u0000') !== -1) ln = ln.replace(/\0/g, '�')
    this.line = ln

    // 1. Which open blocks does this line continue?
    let last: Block | undefined
    while ((last = container.lastChild) && last.open) {
      container = last
      this.findNextNonspace()
      const res = this.rule(container.type).continue!(this, container)
      if (res === 2) return // line consumed (e.g. closing code fence)
      if (res === 1) {
        container = container.parent!
        break
      }
    }

    this.allClosed = container === this.oldtip
    this.lastMatchedContainer = container

    // 2. Try block starts, unless we are inside a leaf that takes raw lines.
    let matchedLeaf = container.type !== 'paragraph' && !!this.rule(container.type).acceptsLines
    while (!matchedLeaf) {
      this.findNextNonspace()
      if (this.maybeSpecial && !this.indented && !this.maybeSpecial.test(ln.slice(this.nextNonspace))) {
        this.advanceNextNonspace()
        break
      }
      let i = 0
      for (; i < this.starts.length; i++) {
        const res = this.starts[i].start!(this, container)
        if (res === 1) {
          container = this.tip
          break
        }
        if (res === 2) {
          container = this.tip
          matchedLeaf = true
          break
        }
      }
      if (i === this.starts.length) {
        this.advanceNextNonspace()
        break
      }
    }

    // 3. What remains is text.
    if (!this.allClosed && !this.blank && this.tip.type === 'paragraph') {
      this.addLine() // lazy paragraph continuation
    } else {
      this.closeUnmatchedBlocks()
      const rule = this.rule(container.type)
      if (rule.acceptsLines) {
        this.addLine()
        if (container.data.closeOnLine?.(this.line.slice(this.offset))) {
          this.finalize(container, this.lineNumber)
        }
      } else if (this.offset < ln.length && !this.blank) {
        this.addChild('paragraph', this.offset)
        this.advanceNextNonspace()
        this.addLine()
      }
    }
  }
}
