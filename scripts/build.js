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
    gfm: 'src/gfm/index.ts',
    container: 'src/plugins/container.ts',
    headings: 'src/plugins/headings.ts',
    adapter: 'src/adapter.ts',
    math: 'src/plugins/math.ts',
    mark: 'src/plugins/mark.ts',
    frontmatter: 'src/plugins/frontmatter.ts',
    deflist: 'src/plugins/deflist.ts',
    mermaid: 'src/plugins/mermaid.ts',
    element: 'src/element.ts',
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

// esbuild adds bare `import "./chunk-X.js"` lines to keep evaluation order.
// No module has side effects (package.json: "sideEffects": false), so they do
// nothing, and every consumer's bundler warns about each one ("Ignoring this
// import…"). Each becomes an empty line, so the source maps stay aligned.
for (const f of readdirSync('dist').filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(join('dist', f), 'utf8')
  const out = src.replace(/^import "\.\/chunk-[A-Z0-9]+\.js";$/gm, '')
  if (out !== src) writeFileSync(join('dist', f), out)
}

execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { stdio: 'inherit' })

// Declarations keep the source's `.ts` specifiers; consumers expect `.js`.
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
for (const file of walk('dist/types').filter((f) => f.endsWith('.d.ts'))) {
  const src = readFileSync(file, 'utf8')
  writeFileSync(file, src.replace(/(from\s+['"]\.{1,2}\/[^'"]+)\.ts(['"])/g, '$1.js$2'))
}
console.log('built dist/')
