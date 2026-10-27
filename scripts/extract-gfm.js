// Extract GFM extension examples into test/fixtures/gfm.json.
//
//   curl -sSfL https://raw.githubusercontent.com/github/cmark-gfm/master/test/spec.txt -o /tmp/spec.txt
//   curl -sSfL https://raw.githubusercontent.com/github/cmark-gfm/master/test/extensions.txt -o /tmp/extensions.txt
//   node scripts/extract-gfm.js /tmp/spec.txt /tmp/extensions.txt
//
// From spec.txt only examples tagged with an extension are kept (the rest
// are the CommonMark examples, already covered). `→` stands for a tab.
import { readFileSync, writeFileSync } from 'node:fs'

const FENCE = '`'.repeat(32)
const [specPath, extPath] = process.argv.slice(2)
if (!specPath || !extPath) {
  console.error('usage: node scripts/extract-gfm.js <spec.txt> <extensions.txt>')
  process.exit(1)
}

function extract(text, source, keep) {
  const out = []
  let section = ''
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const heading = /^#{1,6} +(.*)$/.exec(lines[i])
    if (heading) section = heading[1].trim()
    if (!lines[i].startsWith(FENCE + ' example')) continue
    const tag = lines[i].slice(FENCE.length + ' example'.length).trim()
    const md = []
    const html = []
    let target = md
    for (i++; i < lines.length && lines[i] !== FENCE; i++) {
      if (lines[i] === '.' && target === md) target = html
      else target.push(lines[i])
    }
    if (!keep(tag)) continue
    const join = (a) => (a.length ? a.join('\n') + '\n' : '').replace(/→/g, '\t')
    out.push({ markdown: join(md), html: join(html), section, extension: tag === 'disabled' ? 'tasklist' : tag || 'mixed', source, line: i })
  }
  return out
}

const examples = [
  ...extract(readFileSync(specPath, 'utf8'), 'spec.txt', (tag) => tag !== ''),
  ...extract(readFileSync(extPath, 'utf8'), 'extensions.txt', () => true),
].map((ex, n) => ({ example: n + 1, ...ex }))

writeFileSync(new URL('../test/fixtures/gfm.json', import.meta.url), JSON.stringify(examples, null, 1) + '\n')
console.log(`wrote ${examples.length} examples`)
