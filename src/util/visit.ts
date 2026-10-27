// Depth-first, pre-order tree walk for transforms.

import type { Node } from '../types.ts'

/**
 * Call `fn` for every node below (and including) `node`. Return `false` from
 * `fn` to skip a node's children. Mutating `parent.children` at or after
 * `index` is safe; the walk reads children after `fn` returns.
 */
export function visit(node: Node, fn: (node: Node, parent: Node | null, index: number) => boolean | void, parent: Node | null = null, index = 0): void {
  if (fn(node, parent, index) === false || !node.children) return
  for (let i = 0; i < node.children.length; i++) visit(node.children[i], fn, node, i)
}
