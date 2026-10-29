// Minified + gzipped size of every entry point, measured exactly like
// scripts/size.js (esbuild, es2022, gzip level 9; plugins measured with the
// core marked external, mdlib-pure/element whole since it bundles the core and
// every plugin). GFM parts are measured as single named exports.
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import { ROOT } from './context.js'

const externalCore = {
  name: 'external-core',
  setup(b) {
    b.onResolve({ filter: /^\.\.\/(block|inline|util|render|types)/ }, (args) => ({ path: args.path, external: true }))
  },
}

async function measure({ entry, contents, external }) {
  const result = await build({
    ...(contents ? { stdin: { contents, resolveDir: ROOT, loader: 'ts' } } : { entryPoints: [entry], absWorkingDir: ROOT }),
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    target: 'es2022',
    legalComments: 'none',
    plugins: external ? [externalCore] : [],
  })
  const code = result.outputFiles[0].contents
  return { min: code.length, gzip: gzipSync(code, { level: 9 }).length }
}

export const ENTRIES = [
  { id: 'core', name: 'mdlib-pure', entry: 'src/index.ts' },
  { id: 'entities', name: 'mdlib-pure/entities', entry: 'src/entities/index.ts' },
  { id: 'gfm', name: 'mdlib-pure/gfm', entry: 'src/gfm/index.ts', external: true },
  { id: 'container', name: 'mdlib-pure/container', entry: 'src/plugins/container.ts', external: true },
  { id: 'headings', name: 'mdlib-pure/headings', entry: 'src/plugins/headings.ts', external: true },
  { id: 'adapter', name: 'mdlib-pure/adapter', entry: 'src/adapter.ts', external: true },
  { id: 'math', name: 'mdlib-pure/math', entry: 'src/plugins/math.ts', external: true },
  { id: 'mark', name: 'mdlib-pure/mark', entry: 'src/plugins/mark.ts', external: true },
  { id: 'frontmatter', name: 'mdlib-pure/frontmatter', entry: 'src/plugins/frontmatter.ts', external: true },
  { id: 'deflist', name: 'mdlib-pure/deflist', entry: 'src/plugins/deflist.ts', external: true },
  { id: 'mermaid', name: 'mdlib-pure/mermaid', entry: 'src/plugins/mermaid.ts', external: true },
  // Batteries included: core + every plugin + the two elements, measured whole.
  { id: 'element', name: 'mdlib-pure/element', entry: 'src/element.ts' },
]

export const GFM_PARTS = ['table', 'strikethrough', 'autolink', 'tasklist', 'footnotes', 'tagfilter', 'alerts']

export async function measureAll() {
  const sizes = {}
  for (const e of ENTRIES) sizes[e.id] = { name: e.name, ...(await measure(e)) }
  sizes.gfmParts = {}
  for (const part of GFM_PARTS) {
    sizes.gfmParts[part] = await measure({ contents: `export { ${part} } from './src/gfm/index.ts'`, external: true })
  }
  return sizes
}
