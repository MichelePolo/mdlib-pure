// Size budget: each entry point, minified and gzipped, must stay under its
// limit. Exit code 1 if any budget is exceeded.
//
// Raising a budget is a design decision: discuss it, don't just bump it.
import { build } from 'esbuild'
import { gzipSync } from 'node:zlib'

const budgets = [
  { name: 'mdlib-pure', entry: 'src/index.ts', limit: 11 * 1024 },
  { name: 'mdlib-pure/entities', entry: 'src/entities/index.ts', limit: 12 * 1024 },
]

let failed = false
for (const { name, entry, limit } of budgets) {
  const result = await build({ entryPoints: [entry], bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', legalComments: 'none' })
  const code = result.outputFiles[0].contents
  const gz = gzipSync(code, { level: 9 }).length
  const ok = gz <= limit
  failed ||= !ok
  const kb = (n) => (n / 1024).toFixed(2).padStart(6) + ' KB'
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(22)} min ${kb(code.length)}   gzip ${kb(gz)}   budget ${kb(limit)}`)
}
process.exitCode = failed ? 1 : 0
