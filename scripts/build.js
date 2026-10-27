// Build dist/: ES module bundles (esbuild) and type declarations (tsc).
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'

rmSync('dist', { recursive: true, force: true })

await build({
  entryPoints: {
    index: 'src/index.ts',
    entities: 'src/entities/index.ts',
  },
  outdir: 'dist',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  sourcemap: true,
  legalComments: 'none',
})

execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' })

// Declarations keep the source's `.ts` specifiers; consumers expect `.js`.
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
for (const file of walk('dist/types').filter((f) => f.endsWith('.d.ts'))) {
  const src = readFileSync(file, 'utf8')
  writeFileSync(file, src.replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2'))
}
console.log('built dist/')
