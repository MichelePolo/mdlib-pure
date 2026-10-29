// Build the static assets of the Blazor wrapper (bindings/blazor) into
// bindings/blazor/src/MdlibPure.Blazor/wwwroot/dist/ (gitignored):
//
//   mdlib-element.js   <mdlib-markdown> and <mdlib-editor> (src/element.ts)
//   mdlib-service.js   the module behind IMarkdownService (parse, toc, render)
//   chunks/            code shared by the two (one getMarkdown(), one config registry)
//   theme.css, editor.css
//   katex/             KaTeX auto-render (ESM, KaTeX included), its CSS, woff2 fonts, LICENSE
//   mermaid/           Mermaid (ESM, split per diagram type, loaded on demand), LICENSE
//   THIRD-PARTY-NOTICES.txt   every package bundled into the files above, with its license
//
//   node scripts/build-blazor-assets.js     (npm run blazor:assets)
//
// Bundled from src/ (not dist/), so `npm run build` is not needed first.
// KaTeX and Mermaid are dev dependencies of the repository: the npm library
// stays zero-dependency; they ship only inside the NuGet package.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RCL = join(ROOT, 'bindings/blazor/src/MdlibPure.Blazor')
const OUT = join(RCL, 'wwwroot/dist')
const NM = join(ROOT, 'node_modules')

for (const pkg of ['esbuild', 'katex', 'mermaid']) {
  if (!existsSync(join(NM, pkg, 'package.json'))) {
    console.error(`✗ node_modules/${pkg} is missing: run \`npm ci\` at the repository root first.`)
    process.exit(1)
  }
}

const t0 = performance.now()
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const common = {
  absWorkingDir: ROOT,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  // License comments are collected into THIRD-PARTY-NOTICES.txt instead.
  legalComments: 'none',
  metafile: true,
  logLevel: 'error',
}

// --- mdlib-pure: the elements and the service module, sharing one chunk -------
const mdlib = await build({
  ...common,
  entryPoints: {
    'mdlib-element': 'src/element.ts',
    'mdlib-service': 'bindings/blazor/src/MdlibPure.Blazor/Scripts/mdlib-service.js',
  },
  outdir: OUT,
  chunkNames: 'chunks/[name]-[hash]',
  splitting: true,
})

copyFileSync(join(ROOT, 'styles/theme.css'), join(OUT, 'theme.css'))
copyFileSync(join(ROOT, 'styles/editor.css'), join(OUT, 'editor.css'))

// --- KaTeX: auto-render as one ES module, the stylesheet and the woff2 fonts ---
const katexDist = join(NM, 'katex/dist')
mkdirSync(join(OUT, 'katex/fonts'), { recursive: true })
const katex = await build({
  ...common,
  stdin: { contents: "export { default } from 'katex/contrib/auto-render'", resolveDir: ROOT, loader: 'js' },
  outfile: join(OUT, 'katex/auto-render.js'),
})
copyFileSync(join(katexDist, 'katex.min.css'), join(OUT, 'katex/katex.min.css'))
// Every browser of the Baseline 2024 target loads the woff2 files first.
for (const f of readdirSync(join(katexDist, 'fonts')).filter((f) => f.endsWith('.woff2'))) {
  copyFileSync(join(katexDist, 'fonts', f), join(OUT, 'katex/fonts', f))
}
copyFileSync(join(NM, 'katex/LICENSE'), join(OUT, 'katex/LICENSE'))

// --- Mermaid: split per diagram type (like the site), loaded only with diagrams -
const mermaid = await build({
  ...common,
  stdin: { contents: "export { default } from 'mermaid'", resolveDir: ROOT, loader: 'js' },
  outdir: join(OUT, 'mermaid'),
  entryNames: 'mermaid',
  chunkNames: 'chunks/[name]-[hash]',
  splitting: true,
})
copyFileSync(join(NM, 'mermaid/LICENSE'), join(OUT, 'mermaid/LICENSE'))

// --- THIRD-PARTY-NOTICES.txt: every npm package that ended up in a bundle -------
const packages = new Map() // dir -> { name, version, license, text }
for (const meta of [mdlib.metafile, katex.metafile, mermaid.metafile]) {
  for (const input of Object.keys(meta.inputs)) {
    const parts = input.split(/[\\/]/)
    const at = parts.lastIndexOf('node_modules')
    if (at < 0) continue
    const dir = parts.slice(0, at + (parts[at + 1].startsWith('@') ? 3 : 2)).join(sep)
    if (packages.has(dir)) continue
    const pkg = JSON.parse(readFileSync(join(ROOT, dir, 'package.json'), 'utf8'))
    const licenseFile = readdirSync(join(ROOT, dir)).find((f) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(f))
    packages.set(dir, {
      name: pkg.name,
      version: pkg.version,
      license: typeof pkg.license === 'string' ? pkg.license : (pkg.license?.type ?? 'see package'),
      text: licenseFile ? readFileSync(join(ROOT, dir, licenseFile), 'utf8').trim() : `No license file in the package; license field: ${pkg.license ?? 'none'}.`,
    })
  }
}
const own = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const notices = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))
const rule = '-'.repeat(78)
writeFileSync(
  join(OUT, 'THIRD-PARTY-NOTICES.txt'),
  `MdlibPure.Blazor static assets: third-party notices

The files in this folder are built from mdlib-pure ${own.version} (MIT, Copyright (c) Michele Polo,
https://github.com/MichelePolo/mdlib-pure) and bundle the npm packages listed below.
KaTeX (katex/) and Mermaid (mermaid/) are loaded by the browser only when a document
contains math or diagrams.

${notices.map((p) => `${rule}\n${p.name} ${p.version} (${p.license})\n${rule}\n\n${p.text}\n`).join('\n')}`,
)
copyFileSync(join(ROOT, 'LICENSE'), join(OUT, 'LICENSE'))

// --- Summary --------------------------------------------------------------------
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]))
const files = walk(OUT)
const size = (list) => `${(list.reduce((n, f) => n + statSync(f).size, 0) / 1024).toFixed(0)} KB`
const under = (d) => files.filter((f) => f.startsWith(join(OUT, d) + sep))
console.log(`built ${relative(ROOT, OUT)}/ in ${((performance.now() - t0) / 1000).toFixed(1)} s: ${files.length} files, ${size(files)}`)
console.log(`  mdlib-pure ${size(files.filter((f) => /^(mdlib-|chunks[\\/])/.test(relative(OUT, f))))}, katex ${size(under('katex'))}, mermaid ${size(under('mermaid'))}`)
console.log(`  ${notices.length} third-party packages listed in THIRD-PARTY-NOTICES.txt`)
