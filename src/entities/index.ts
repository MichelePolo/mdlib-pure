// Full HTML named-entity decoder, for environments without a DOM (Node, SSR,
// workers) or when exact results independent of the browser are required.
//
//   import { decodeEntity } from 'mdlib-pure/entities'
//   createMarkdown({ decodeEntity })

import type { EntityDecoder } from '../util/entities.ts'
import { TABLE } from './table.ts'

let map: Map<string, string> | undefined

export const decodeEntity: EntityDecoder = (name) => {
  if (!map) {
    map = new Map()
    for (const entry of TABLE.split(',')) {
      const i = entry.indexOf(':')
      const cps = entry.slice(i + 1).split('.').map((h) => parseInt(h, 16))
      map.set(entry.slice(0, i), String.fromCodePoint(...cps))
    }
  }
  return map.get(name)
}
