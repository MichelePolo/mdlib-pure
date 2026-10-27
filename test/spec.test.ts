// CommonMark 0.31.2 conformance: every example of the official spec.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { decodeEntity } from '../src/entities/index.ts'
import { createMarkdown } from '../src/index.ts'

interface Example {
  markdown: string
  html: string
  example: number
  section: string
}

const examples: Example[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2.json', import.meta.url), 'utf8'))
// The spec assumes raw HTML is allowed and URLs are not filtered.
const md = createMarkdown({ html: true, decodeEntity, allowUrl: () => true })

const sections = new Map<string, Example[]>()
for (const ex of examples) sections.set(ex.section, [...(sections.get(ex.section) ?? []), ex])
for (const [section, list] of sections) {
  describe(section, () => {
    for (const ex of list) test(`example ${ex.example}`, () => assert.equal(md.render(ex.markdown), ex.html))
  })
}
