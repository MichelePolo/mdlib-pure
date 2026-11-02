// Project invariants that the type checker cannot see. Exit code 1 on violation.
// (3. below keeps the docs complete for humans and agents.)
//
//  1. Zero runtime dependencies (package.json and imports in src/).
//  2. No HTML sinks on content (innerHTML, outerHTML, insertAdjacentHTML,
//     document.write, eval, new Function) unless the line is explicitly marked
//     `check:allow-innerHTML` with a justification next to it.
//  3. Docs coverage (below).
//  4. Binding parity: what the core offers, every wrapper offers (AGENTS.md
//     rule 11). Every first-party plugin export is a plugin name of the
//     elements; the Blazor and Angular wrappers list the same names in the
//     same order; every custom element of the repository is wrapped by both.
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

// 4. Binding parity (AGENTS.md rule 11, "Bindings follow the core").
const read = (f) => readFileSync(f, 'utf8')
const elementSource = read('src/element.ts')
const factories = /const FACTORIES = new Map[^[]*\[([\s\S]*?)\n\]\)/.exec(elementSource)
const elementPlugins = factories ? [...factories[1].matchAll(/^\s*\['([a-z]+)'/gm)].map((m) => m[1]) : []
if (!elementPlugins.length) errors.push('src/element.ts: plugin table (FACTORIES) not found')
/** Entry points that are not syntax plugins (no `plugins` name in the elements). */
const NOT_PLUGINS = new Set(['.', './package.json', './entities', './adapter', './element'])
for (const sub of Object.keys(pkg.exports)) {
  if (NOT_PLUGINS.has(sub) || sub.endsWith('.css')) continue
  if (!elementPlugins.includes(sub.slice(2))) errors.push(`src/element.ts: plugin "mdlib-pure/${sub.slice(2)}" has no name in FACTORIES (the elements and every binding need it)`)
}
const angularPlugins = /MARKDOWN_PLUGINS[^=]*=\s*\[([^\]]*)\]/.exec(read('bindings/angular/projects/ngx-mdlib-pure/src/lib/plugins.ts'))
const blazorPlugins = /Names\s*=\s*\[([\s\S]*?)\];/.exec(read('bindings/blazor/src/MdlibPure.Blazor/MarkdownPlugins.cs'))
const lists = {
  'bindings/angular (MARKDOWN_PLUGINS in plugins.ts)': angularPlugins ? [...angularPlugins[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]) : [],
  'bindings/blazor (Names in MarkdownPlugins.cs)': blazorPlugins ? [...blazorPlugins[1].matchAll(/"([a-z]+)"\)/g)].map((m) => m[1]) : [],
}
for (const [where, names] of Object.entries(lists)) {
  if (names.join(' ') !== elementPlugins.join(' ')) errors.push(`${where}: plugins [${names.join(', ')}], the elements have [${elementPlugins.join(', ')}]`)
}
/** Every source file under a directory (no build output or dependencies). */
function sources(dir, ext) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && ext.test(e.name) && !/(^|\/)(node_modules|dist|bin|obj|wwwroot)(\/|$)/.test(join(e.parentPath, e.name)))
    .map((e) => read(join(e.parentPath, e.name)))
    .join('\n')
}
const blazorSources = sources('bindings/blazor/src', /\.razor$/)
const angularSources = sources('bindings/angular/projects', /\.ts$/)
const defined = new Set([...(elementSource + read('templates/podcast/element.js')).matchAll(/customElements\.define\('([a-z-]+)'/g)].map((m) => m[1]))
for (const tag of defined) {
  if (!blazorSources.includes(`<${tag}`)) errors.push(`bindings/blazor: no Razor component renders <${tag}>`)
  if (!angularSources.includes(`selector: '${tag}'`)) errors.push(`bindings/angular: no component has selector '${tag}'`)
}

if (errors.length) {
  for (const e of errors) console.error('✗ ' + e)
  process.exitCode = 1
} else {
  console.log('✓ zero dependencies, no unmarked HTML sinks, public API and guides documented, bindings at parity')
}
