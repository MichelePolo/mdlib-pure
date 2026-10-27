// GFM tables (https://github.github.com/gfm/#tables-extension-).
//
//   | a | b |      ← header row: the last line of the paragraph above
//   |:--|--:|      ← delimiter row: detected by the `start` rule
//   | 1 | 2 |      ← rows, until a blank line or another block starts
//
// AST (mdast): table { align } > tableRow > tableCell > inline content.
// The first row is the header.

import { Block, type BlockParser, MAX_NESTING } from '../block/parser.ts'
import type { BlockRule, Node, Plugin, RenderFn } from '../types.ts'

export type Align = 'left' | 'right' | 'center' | null

/**
 * Cap on empty cells added to short rows. Without it a wide header followed
 * by many one-character rows makes output quadratic in input size (the same
 * defense as cmark-gfm). Rows beyond the cap end the table.
 */
const MAX_AUTOCOMPLETED_CELLS = 0x80000

/** Split a row into raw cell texts on unescaped pipes; outer pipes are optional. */
export function splitRow(line: string): string[] {
  const s = line.trim()
  const cells: string[] = []
  let start = s.charCodeAt(0) === 124 /* | */ ? 1 : 0
  let i = start
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 92 /* \ */) i++
    else if (c === 124) {
      cells.push(s.slice(start, i))
      start = i + 1
    }
  }
  if (start < s.length) cells.push(s.slice(start))
  // `\|` stands for a literal pipe, even inside code spans.
  return cells.map((c) => c.trim().replace(/\\\|/g, '|'))
}

const reDelimiterCell = /^:?-+:?$/

function parseDelimiterRow(line: string): Align[] | null {
  if (!/[|:-]/.test(line) || !/-/.test(line)) return null
  const cells = splitRow(line)
  if (cells.length === 0) return null
  const align: Align[] = []
  for (const cell of cells) {
    if (!reDelimiterCell.test(cell)) return null
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    align.push(left && right ? 'center' : right ? 'right' : left ? 'left' : null)
  }
  return align
}

function openTable(p: BlockParser, container: Block): 0 | 2 {
  if (p.indented || container.type !== 'paragraph' || container.depth >= MAX_NESTING) return 0
  const align = parseDelimiterRow(p.rest())
  if (!align) return 0
  const lines = container.content.replace(/\n$/, '').split('\n')
  const header = splitRow(lines[lines.length - 1])
  if (header.length !== align.length) return 0

  p.closeUnmatchedBlocks()
  // Lines above the header stay a paragraph; an emptied paragraph is dropped.
  if (lines.length > 1) {
    container.content = lines.slice(0, -1).join('\n') + '\n'
    p.finalize(container, p.lineNumber - 2)
  } else {
    p.tip = container.parent!
    container.remove()
  }
  const table = p.addChild('table', p.nextNonspace)
  table.startLine = p.lineNumber - 1
  table.data.align = align
  table.data.header = header
  p.advanceOffset(p.line.length - p.offset)
  return 2
}

export const tableRule: BlockRule = {
  name: 'table',
  // No triggers: rows can start with any character.
  canContain: (t) => t === 'tableRow',
  continue: (p) => (p.blank ? 1 : 0),
  start(p, container) {
    if (container.type !== 'table') return openTable(p, container)
    if (p.blank) return 0
    const missing = Math.max(0, container.data.align.length - splitRow(p.rest()).length)
    if ((container.data.autocompleted = (container.data.autocompleted ?? 0) + missing) > MAX_AUTOCOMPLETED_CELLS) return 0
    p.closeUnmatchedBlocks()
    p.addChild('tableRow', p.nextNonspace)
    return 2
  },
  finalize(_p, b) {
    const align = b.data.align as Align[]
    const texts: string[][] = [b.data.header, ...b.children.map((row) => splitRow(row.content))]
    // Rebuild children as rows of cells; extra cells are dropped, missing ones added.
    b.children = texts.map((cells, r) => {
      const row = new Block('tableRow', b.startLine + r)
      row.parent = b
      row.open = false
      row.children = align.map((_, i) => {
        const cell = new Block('tableCell', row.startLine)
        cell.parent = row
        cell.open = false
        cell.content = cells[i] ?? ''
        return cell
      })
      return row
    })
    b.node.align = align
  },
  content: 'block',
}

export const tableRowRule: BlockRule = {
  name: 'tableRow',
  acceptsLines: true,
  continue: () => 1,
  content: 'block',
}

export const tableCellRule: BlockRule = {
  name: 'tableCell',
  continue: () => 1,
  content: 'inline',
}

const renderTable: RenderFn = (n, r) => {
  const align = n.align as Align[]
  const [head, ...body] = n.children as Node[]
  const row = (rowNode: Node, tag: 'th' | 'td') =>
    r.h('tr', null, (rowNode.children as Node[]).map((cell, i) => r.h(tag, align[i] ? { align: align[i] } : null, r.children(cell))))
  return r.h('table', null, r.h('thead', null, row(head, 'th')), body.length ? r.h('tbody', null, body.map((b) => row(b, 'td'))) : null)
}

export const table = (): Plugin => ({
  name: 'gfm-table',
  block: [tableRule, tableRowRule, tableCellRule],
  render: { table: renderTable },
})
