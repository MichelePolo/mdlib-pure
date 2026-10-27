// Project invariants that the type checker cannot see. Exit code 1 on violation.
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

if (errors.length) {
  for (const e of errors) console.error('✗ ' + e)
  process.exitCode = 1
} else {
  console.log('✓ zero dependencies, no unmarked HTML sinks')
}
