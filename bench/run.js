// mdlib-pure benchmark: throughput (Node), bundle size, CommonMark conformance.
//
//   npm install --prefix bench && node bench/run.js
//
// Options:
//   --quick                   short warm-up/samples (smoke test); does not write RESULTS.md
//   --only=throughput,size,conformance   run a subset (default: all three)
//   --no-write                print the tables only; do not write RESULTS.md / results.json
//   --libs=id,id              only these rows (ids in libs.js), e.g. --libs=mdlib-pure,marked;
//                             implies --no-write
//
// Prerequisite: `npm ci && npm run build` at the repo root (mdlib-pure is
// benchmarked from dist/, i.e. what is published).
//
// See README.md for the method and caveats.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import v8 from 'node:v8'
import vm from 'node:vm'
import { gzipSync } from 'node:zlib'

const benchDir = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(benchDir, '..')

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const quick = args.includes('--quick')
const libFilter = args.find((a) => a.startsWith('--libs='))?.slice(7).split(',')
const write = !quick && !libFilter && !args.includes('--no-write')
const only = new Set((args.find((a) => a.startsWith('--only='))?.slice(7) ?? 'throughput,size,conformance').split(','))

const CONFIG = quick
  ? { warmupMs: 200, sampleMs: 40, rounds: 3 }
  : { warmupMs: 1500, sampleMs: 250, rounds: 15 }

// ── Prerequisites ───────────────────────────────────────────────────────────
for (const f of ['dist/index.js', 'dist/gfm.js', 'dist/entities.js']) {
  if (!existsSync(join(rootDir, f))) {
    console.error(`Missing ${f}. Run \`npm ci && npm run build\` at the repo root first.`)
    process.exit(1)
  }
}
if (!existsSync(join(benchDir, 'node_modules', 'marked'))) {
  console.error('Missing bench dependencies. Run `npm install --prefix bench` first.')
  process.exit(1)
}

// Expose the GC without requiring `node --expose-gc`: collecting before every
// sample means no library pays for the garbage left by the previous one.
v8.setFlagsFromString('--expose-gc')
const gc = vm.runInNewContext('gc')

const all = await import('./libs.js')
const libs = libFilter ? all.libs.filter((l) => libFilter.includes(l.id)) : all.libs
const extraBundles = libFilter ? all.extraBundles.filter((l) => libFilter.includes(l.id)) : all.extraBundles
if (libFilter && libs.length + extraBundles.length !== libFilter.length) {
  console.error(`unknown id in --libs; known: ${[...all.libs, ...all.extraBundles].map((l) => l.id).join(', ')}`)
  process.exit(1)
}

// ── Inputs ──────────────────────────────────────────────────────────────────
const SPEC_SHA256 = 'bfef4ddc97276b6ab6c2a28ace48478e35b1c50e60cde9f517ab8ab030aa3b82'
const SPEC_URL = 'https://spec.commonmark.org/0.31.2/spec.txt'
const specPath = join(benchDir, 'fixtures', 'spec.txt')
if (!existsSync(specPath)) {
  console.error(`fixtures/spec.txt missing, downloading ${SPEC_URL}`)
  const res = await fetch(SPEC_URL)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  writeFileSync(specPath, Buffer.from(await res.arrayBuffer()))
}
const spec = readFileSync(specPath, 'utf8')
const specHash = createHash('sha256').update(readFileSync(specPath)).digest('hex')
if (specHash !== SPEC_SHA256) console.warn(`warning: fixtures/spec.txt sha256 ${specHash} differs from the expected ${SPEC_SHA256}`)
const readme = readFileSync(join(benchDir, 'fixtures', 'readme.md'), 'utf8')
const examples = JSON.parse(readFileSync(join(rootDir, 'test', 'fixtures', 'commonmark-0.31.2.json'), 'utf8'))

const bytes = (docs) => docs.reduce((n, s) => n + Buffer.byteLength(s, 'utf8'), 0)
const inputs = [
  { id: 'spec', label: 'spec.txt', docs: [spec], unit: 'MB/s' },
  { id: 'readme', label: 'README-like', docs: [readme], unit: 'MB/s' },
  { id: 'examples', label: '652 spec examples', docs: examples.map((e) => e.markdown), unit: 'k docs/s' },
]
for (const input of inputs) input.bytes = bytes(input.docs)

// ── Helpers ─────────────────────────────────────────────────────────────────
const median = (xs) => quantile(xs, 0.5)
function quantile(xs, q) {
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}
const fmt = (x, digits = 1) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(digits) : x.toFixed(digits + 1))
const ratio = (x) => `${x.toFixed(2)}×`
const kb = (n) => (n / 1024).toFixed(1)
/** Markdown table; `align` has one char per column: l(eft) or r(ight). */
const table = (head, rows, align) =>
  [`| ${head.join(' | ')} |`, `| ${head.map((_, i) => (align[i] === 'r' ? '---:' : '---')).join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n')
const label = (lib) => lib.name
const baselineOf = (lib, list) => list.find((l) => l.baseline && l.mode === lib.mode)

/**
 * Normalize HTML serialization style (same as test/helpers.ts): sorted
 * attributes, `attr=""` → `attr`, no self-closing slash (`<br />` → `<br>`),
 * lowercase tag names, no whitespace between tags.
 */
function normalize(html) {
  return html
    .replace(/<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*\/?>/g, (_, tag, attrs) => {
      const list = (attrs.match(/[^\s=]+(?:="[^"]*")?/g) ?? []).map((a) => a.replace(/=""$/, '')).sort()
      return `<${tag.toLowerCase()}${list.map((a) => ' ' + a).join('')}>`
    })
    .replace(/>\s+</g, '><')
    .trim()
}

// ── Environment ─────────────────────────────────────────────────────────────
function git(...a) {
  try {
    return execFileSync('git', a, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}
const commit = git('rev-parse', '--short', 'HEAD')
const dirty = git('status', '--porcelain', '--', 'src') !== ''
const cpus = os.cpus()
const env = {
  date: new Date().toISOString(),
  node: process.version,
  v8: process.versions.v8,
  os: `${os.type()} ${os.release()} (${os.arch()})`,
  cpu: `${cpus[0]?.model.trim() ?? 'unknown'} (${cpus.length} logical CPUs)`,
  memory: `${Math.round(os.totalmem() / 2 ** 30)} GiB`,
  mdlibPure: `${all.libs[0].version} (${commit || 'unknown commit'}${dirty ? ', src/ modified' : ''}, from dist/)`,
  config: CONFIG,
}

// ── 1. Throughput ───────────────────────────────────────────────────────────
let sink = 0 // consumed at the end so no render can be optimized away

function pass(render, docs, iterations) {
  let n = 0
  const t0 = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) for (let j = 0; j < docs.length; j++) n += render(docs[j]).length
  const t1 = process.hrtime.bigint()
  sink += n
  return Number(t1 - t0) / 1e9 // seconds
}

function throughput() {
  const renders = libs.map((lib) => ({ lib, render: lib.create() }))
  const results = {} // results[libId][inputId] = { samples: [...unit/s], outputBytes }
  for (const { lib, render } of renders) {
    results[lib.id] = {}
    for (const input of inputs) {
      // Sanity check: every library must produce output for every input.
      const out = input.docs.map((d) => render(d))
      if (out.some((o) => typeof o !== 'string') || out.join('').length === 0) throw new Error(`${lib.id} produced no output for ${input.id}`)
      results[lib.id][input.id] = { samples: [], outputBytes: bytes(out), iterations: 0 }
    }
  }

  for (const input of inputs) {
    const perUnit = input.unit === 'MB/s' ? input.bytes / 1e6 : input.docs.length / 1e3
    process.stderr.write(`throughput: ${input.label} (${kb(input.bytes)} KB, ${input.docs.length} doc${input.docs.length > 1 ? 's' : ''})\n`)
    // Warm-up each library on this input (JIT tiers, lazy tables), then
    // calibrate how many passes make one sample of ~sampleMs.
    for (const { lib, render } of renders) {
      gc()
      let passes = 0
      let elapsed = 0
      while (elapsed * 1000 < CONFIG.warmupMs || passes < 5) {
        elapsed += pass(render, input.docs, 1)
        passes++
      }
      results[lib.id][input.id].iterations = Math.max(1, Math.round((CONFIG.sampleMs / 1000) * (passes / elapsed)))
    }
    // Timed rounds. Libraries are interleaved (and the order rotated each
    // round) so that thermal/frequency drift does not favour one of them.
    for (let round = 0; round < CONFIG.rounds; round++) {
      for (let k = 0; k < renders.length; k++) {
        const { lib, render } = renders[(k + round) % renders.length]
        const r = results[lib.id][input.id]
        gc()
        const seconds = pass(render, input.docs, r.iterations)
        r.samples.push((perUnit * r.iterations) / seconds)
      }
      process.stderr.write(`  round ${round + 1}/${CONFIG.rounds}\r`)
    }
    process.stderr.write('\n')
  }

  for (const lib of libs) {
    for (const input of inputs) {
      const r = results[lib.id][input.id]
      r.median = median(r.samples)
      r.spread = (quantile(r.samples, 0.75) - quantile(r.samples, 0.25)) / 2 / r.median
    }
  }

  const head = ['Library', 'Mode', 'Version', ...inputs.flatMap((i) => [`${i.label} ${i.unit}`, 'vs mdlib-pure'])]
  const rows = libs.map((lib) => {
    const base = baselineOf(lib, libs)
    return [
      lib.baseline ? `**${label(lib)}**` : label(lib),
      lib.mode,
      lib.version,
      ...inputs.flatMap((input) => {
        const r = results[lib.id][input.id]
        const rel = base ? ratio(r.median / results[base.id][input.id].median) : 'n/a'
        return [`${fmt(r.median)} ±${(r.spread * 100).toFixed(1)}%`, lib.baseline ? '1.00×' : rel]
      }),
    ]
  })
  const outputRows = libs.map((lib) => [label(lib), lib.mode, ...inputs.map((input) => kb(results[lib.id][input.id].outputBytes))])
  return {
    results,
    markdown: table(head, rows, 'lll' + 'rr'.repeat(inputs.length)),
    outputMarkdown: table(['Library', 'Mode', ...inputs.map((i) => `${i.label} HTML KB`)], outputRows, 'll' + 'r'.repeat(inputs.length)),
  }
}

// ── 2. Bundle size ──────────────────────────────────────────────────────────
async function size() {
  const { build } = await import('esbuild')
  const rootPkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'))
  // Resolve `mdlib-pure` and `mdlib-pure/*` through the repo's own `exports`
  // map, exactly as a consumer's bundler would (bench/ does not install it).
  const selfReference = {
    name: 'mdlib-pure',
    setup(b) {
      b.onResolve({ filter: /^mdlib-pure(\/.*)?$/ }, (a) => {
        const target = rootPkg.exports['.' + a.path.slice('mdlib-pure'.length)]
        if (!target) return { errors: [{ text: `mdlib-pure does not export ${a.path}` }] }
        return { path: join(rootDir, typeof target === 'string' ? target : target.default) }
      })
    },
  }
  const entries = libs.filter((l) => l.bundle)
  for (const extra of extraBundles) entries.splice(entries.findIndex((l) => l.id === extra.after) + 1 || entries.length, 0, extra)
  const out = []
  for (const lib of entries) {
    const result = await build({
      stdin: { contents: lib.bundle, resolveDir: benchDir, loader: 'js', sourcefile: `${lib.id}.entry.js` },
      bundle: true,
      platform: 'browser',
      format: 'esm',
      minify: true,
      legalComments: 'none',
      write: false,
      metafile: true,
      logLevel: 'error',
      plugins: [selfReference],
    })
    const code = result.outputFiles[0].contents
    const inputsCount = Object.keys(result.metafile.inputs).length - 1 // minus stdin
    out.push({ lib, min: code.length, gzip: gzipSync(code, { level: 9 }).length, modules: inputsCount })
  }
  const head = ['Library (browser entry)', 'Version', 'Min KB', 'Min + gzip KB', 'vs mdlib-pure', 'Modules', 'Named entities', 'Imports']
  const rows = out.map(({ lib, min, gzip, modules }) => {
    const base = out.find((o) => o.lib.baseline && o.lib.mode === lib.mode)
    const imports = [...lib.bundle.matchAll(/import (.+) from '([^']+)'/g)].map((m) => `\`${m[1].replace(/\s+/g, ' ')} from '${m[2]}'\``).join(', ')
    return [lib.baseline ? `**${lib.name}**` : lib.name, lib.version, kb(min), kb(gzip), lib.baseline ? '1.00×' : base ? ratio(gzip / base.gzip) : 'n/a', String(modules), lib.entities, imports]
  })
  return { results: out.map(({ lib, min, gzip, modules }) => ({ id: lib.id, min, gzip, modules })), markdown: table(head, rows, 'llrrrrll') }
}

// ── 3. Conformance ──────────────────────────────────────────────────────────
function conformance() {
  const out = []
  for (const lib of libs) {
    const render = lib.create()
    let exact = 0
    let normalized = 0
    let threw = 0
    const failing = []
    for (const ex of examples) {
      let html
      try {
        html = render(ex.markdown)
      } catch {
        threw++
        failing.push(ex.example)
        continue
      }
      if (html === ex.html) exact++
      if (normalize(html) === normalize(ex.html)) normalized++
      else failing.push(ex.example)
    }
    out.push({ lib, exact, normalized, threw, failing })
  }
  const n = examples.length
  const pct = (x) => `${((100 * x) / n).toFixed(1)}%`
  const head = ['Library', 'Mode', 'Version', 'Exact', '%', 'Normalized', '%', 'Threw']
  const rows = out.map(({ lib, exact, normalized, threw }) => [
    lib.baseline ? `**${label(lib)}**` : label(lib),
    lib.mode,
    lib.version,
    `${exact}/${n}`,
    pct(exact),
    `${normalized}/${n}`,
    pct(normalized),
    String(threw),
  ])
  return {
    results: out.map(({ lib, exact, normalized, threw, failing }) => ({ id: lib.id, exact, normalized, threw, failing })),
    markdown: table(head, rows, 'lllrrrrr'),
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────
const sections = {}
if (only.has('conformance')) sections.conformance = conformance()
if (only.has('size')) sections.size = await size()
if (only.has('throughput')) sections.throughput = throughput()

const envLines = [
  `- Date: ${env.date}`,
  `- Node ${env.node} (V8 ${env.v8}), ${env.os}`,
  `- CPU: ${env.cpu}, ${env.memory} RAM`,
  `- mdlib-pure ${env.mdlibPure}`,
  `- Throughput: ${CONFIG.warmupMs} ms warm-up per library and input, then ${CONFIG.rounds} interleaved samples of ~${CONFIG.sampleMs} ms; median reported, ± is half the interquartile range relative to the median`,
  `- Command: \`node bench/run.js${args.length ? ' ' + args.join(' ') : ''}\``,
].join('\n')

let md = `# Results\n\nGenerated by \`bench/run.js\`; see [README.md](README.md) for the method and caveats.\n\n${envLines}\n`
if (sections.throughput) {
  md += `\n## 1. Throughput (Node, render to HTML string)\n\nHigher is better. "vs mdlib-pure" is the library's throughput divided by mdlib-pure's in the same mode (core for CommonMark rows, core + \`gfm()\` for GFM rows): above 1.00× the library is faster than mdlib-pure. MB = 10^6 bytes of UTF-8 input, KB = 1024 bytes. Inputs: \`spec.txt\` ${kb(inputs[0].bytes)} KB; README-like ${kb(inputs[1].bytes)} KB; 652 examples ${kb(inputs[2].bytes)} KB in total, rendered one by one. Raw HTML allowed and URL filtering off for every library; mdlib-pure decodes named entities with \`mdlib-pure/entities\` (Node has no DOM).\n\n${sections.throughput.markdown}\n\nHTML output size, as a sanity check that every library did comparable work (snarkdown's output is not CommonMark):\n\n${sections.throughput.outputMarkdown}\n`
}
if (sections.size) {
  md += `\n## 2. Bundle size (browser)\n\nLower is better. esbuild ${(await import('esbuild')).version}, \`bundle: true, platform: 'browser', format: 'esm', minify: true, legalComments: 'none'\`, no syntax lowering; gzip level 9. Each entry imports the library the way its README shows and calls it once, so tree-shaking applies equally. "vs mdlib-pure" compares with mdlib-pure core (CommonMark rows) or core + gfm (GFM rows). KB = 1024 bytes.\n\n${sections.size.markdown}\n`
}
if (sections.conformance) {
  md += `\n## 3. CommonMark 0.31.2 conformance (652 examples)\n\n"Exact": output string-equal to the spec's HTML. "Normalized": equal after sorting attributes, \`<br />\` → \`<br>\`, \`attr=""\` → \`attr\` and removing whitespace between tags (same normalization as \`test/helpers.ts\`). GFM rows are expected to differ on a few examples (extended autolinks, \`~\`, tag filter). Raw HTML allowed, URL filtering off.\n\n${sections.conformance.markdown}\n`
}

console.log(md)
if (write) {
  writeFileSync(join(benchDir, 'RESULTS.md'), md)
  const json = {
    env,
    inputs: inputs.map(({ id, label: l, bytes: b, docs }) => ({ id, label: l, bytes: b, docs: docs.length })),
    libs: libs.map(({ id, name, mode, version: ver, options }) => ({ id, name, mode, version: ver, options })),
    ...Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.results])),
  }
  writeFileSync(join(benchDir, 'results.json'), JSON.stringify(json, null, 2) + '\n')
  console.error('wrote bench/RESULTS.md and bench/results.json')
}
if (sink === -1) console.log(sink) // keep `sink` observable
