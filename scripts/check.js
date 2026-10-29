// Project invariants that the type checker cannot see. Exit code 1 on violation.
// (3. below keeps the docs complete for humans and agents.)
//
//  1. Zero runtime dependencies (package.json and imports in src/).
//  2. No HTML sinks on content (innerHTML, outerHTML, insertAdjacentHTML,
//     document.write, eval, new Function) unless the line is explicitly marked
//     `check:allow-innerHTML` with a justification next to it.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const errors = []

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  if (pkg[field] && Object.keys(pkg[field]).length) errors.push(`package.json: "${field}" must be empty (zero-dependency library)`)
}

const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]))
const sink = /\b(innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(|new Function\b)/
const bareImport = /^\s*(?:import|export)\b[^'"]*from\s+['"]([^'".][^'"]*)['"]/

for (const file of files('src').filter((f) => f.endsWith('.ts'))) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const where = `${file}:${i + 1}`
      if (sink.test(line) && !line.includes('check:allow-innerHTML') && !/^\s*(\/\/|\*)/.test(line)) {
        errors.push(`${where}: HTML sink not allowed: ${line.trim()}`)
      }
      const m = bareImport.exec(line)
      if (m) errors.push(`${where}: imports package "${m[1]}" (src/ must not have dependencies)`)
    })
}

// 3. Docs coverage: every public entry point is documented for humans and
//    agents (docs/api.md, README.md), and every guide is reachable from the
//    README (the site and llms.txt are generated from these files).
const api = readFileSync('docs/api.md', 'utf8')
const readme = readFileSync('README.md', 'utf8')
for (const sub of Object.keys(pkg.exports)) {
  if (sub === './package.json') continue
  const name = sub === '.' ? 'mdlib-pure' : `mdlib-pure/${sub.slice(2)}`
  if (!api.includes(name)) errors.push(`docs/api.md: public entry point "${name}" is not documented`)
  if (!readme.includes(name)) errors.push(`README.md: public entry point "${name}" is not mentioned`)
}
const guides = [
  ...readdirSync('docs').filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync('bindings').map((d) => `bindings/${d}/README.md`).filter((f) => statSync(f, { throwIfNoEntry: false })),
]
for (const guide of guides) if (!readme.includes(guide)) errors.push(`README.md: no link to ${guide}`)

if (errors.length) {
  for (const e of errors) console.error('✗ ' + e)
  process.exitCode = 1
} else {
  console.log('✓ zero dependencies, no unmarked HTML sinks, public API and guides documented')
}
