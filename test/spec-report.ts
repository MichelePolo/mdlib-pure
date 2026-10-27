// CommonMark conformance report: pass rate per section and failing examples.
//
//   npm run spec                 # summary
//   npm run spec -- 281 282      # show diffs for specific examples
//   npm run spec -- --failing    # show diffs for every failing example

import { readFileSync } from 'node:fs'
import { decodeEntity } from '../src/entities/index.ts'
import { createMarkdown } from '../src/index.ts'

interface Example {
  markdown: string
  html: string
  example: number
  section: string
}

const examples: Example[] = JSON.parse(readFileSync(new URL('./fixtures/commonmark-0.31.2.json', import.meta.url), 'utf8'))
const md = createMarkdown({ html: true, decodeEntity, allowUrl: () => true })

const args = process.argv.slice(2)
const showAll = args.includes('--failing')
const wanted = new Set(args.filter((a) => /^\d+$/.test(a)).map(Number))

const bySection = new Map<string, { pass: number; fail: number[] }>()
let pass = 0
for (const ex of examples) {
  let actual: string
  try {
    actual = md.render(ex.markdown)
  } catch (err) {
    actual = `THREW: ${(err as Error).stack}`
  }
  const ok = actual === ex.html
  const s = bySection.get(ex.section) ?? { pass: 0, fail: [] }
  bySection.set(ex.section, s)
  if (ok) {
    s.pass++
    pass++
  } else {
    s.fail.push(ex.example)
  }
  if (wanted.has(ex.example) || (showAll && !ok)) {
    console.log(`\n=== #${ex.example} (${ex.section}) ${ok ? 'PASS' : 'FAIL'}`)
    console.log('markdown:', JSON.stringify(ex.markdown))
    console.log('expected:', JSON.stringify(ex.html))
    console.log('actual:  ', JSON.stringify(actual))
  }
}

console.log()
for (const [section, s] of bySection) {
  const total = s.pass + s.fail.length
  const mark = s.fail.length ? '✗' : '✓'
  console.log(`${mark} ${section.padEnd(42)} ${String(s.pass).padStart(3)}/${total}${s.fail.length ? '  fail: ' + s.fail.join(' ') : ''}`)
}
console.log(`\n${pass}/${examples.length} examples pass (${((pass / examples.length) * 100).toFixed(1)}%)`)
process.exitCode = pass === examples.length ? 0 : 1
