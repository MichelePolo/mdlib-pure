// GFM extension conformance: tagged examples from the GFM spec and
// cmark-gfm's extensions.txt. HTML is compared after normalization (sorted
// attributes, no self-closing slash, no whitespace between tags) because the
// two sources use different serialization conventions.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { decodeEntity } from '../src/entities/index.ts'
import { gfm } from '../src/gfm/index.ts'
import { createMarkdown } from '../src/index.ts'

interface Example {
  example: number
  markdown: string
  html: string
  section: string
  extension: string
  source: string
}

export const examples: Example[] = JSON.parse(readFileSync(new URL('./fixtures/gfm.json', import.meta.url), 'utf8'))
export const md = createMarkdown({ html: true, decodeEntity, allowUrl: () => true, plugins: gfm({ alerts: false }) })

export function normalize(html: string): string {
  return html
    .replace(/<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*\/?>/g, (_, tag: string, attrs: string) => {
      const list = (attrs.match(/[^\s=]+(?:="[^"]*")?/g) ?? []).map((a) => a.replace(/=""$/, '')).sort()
      return `<${tag.toLowerCase()}${list.map((a) => ' ' + a).join('')}>`
    })
    .replace(/>\s+</g, '><')
    .trim()
}

describe('GFM', () => {
  for (const ex of examples) {
    test(`#${ex.example} ${ex.extension}: ${ex.section}`, () => {
      const actual = md.render(ex.markdown)
      if (ex.html.trim() === '<IGNORE>') return // only must not throw
      assert.equal(normalize(actual), normalize(ex.html))
    })
  }
})
