# Benchmark: mdlib-pure vs. popular Markdown libraries

Throughput (Node), browser bundle size and CommonMark conformance of
mdlib-pure compared with [marked], [markdown-it], [commonmark.js][commonmark],
[micromark] (with [micromark-extension-gfm] for the GFM row) and [snarkdown]
(a tiny, non-compliant reference point).

Results from a run on the maintainer's machine are in [RESULTS.md](RESULTS.md).

This directory is a separate, private package: the competitors are
dependencies of `bench/` only, never of mdlib-pure.

## Running

```sh
npm ci && npm run build          # at the repo root: mdlib-pure is benchmarked from dist/
npm install --prefix bench       # or `npm ci --prefix bench` for the exact locked versions
node bench/run.js                # ~3 minutes; writes bench/RESULTS.md and bench/results.json
```

Options:

| Flag | Effect |
|---|---|
| `--only=throughput,size,conformance` | run a subset (default: all three) |
| `--libs=mdlib-pure,commonmark` | only these rows (ids in `libs.js`); does not write results |
| `--quick` | short warm-up and samples, for a smoke test only (numbers are not meaningful); does not write results |
| `--no-write` | print the tables, do not write `RESULTS.md` / `results.json` |

## Files

| File | Content |
|---|---|
| `run.js` | the harness: throughput, size, conformance, report |
| `libs.js` | one adapter per row: configuration, render function, browser entry |
| `fixtures/spec.txt` | CommonMark spec 0.31.2 source (see [License](#license)) |
| `fixtures/readme.md` | a README-like document written for this benchmark |
| `RESULTS.md`, `results.json` | output of the last full run (`results.json` has every sample) |

## What is compared

Each library is benchmarked in up to two modes. "vs mdlib-pure" ratios are
always taken against mdlib-pure in the **same mode**.

| Row | Mode | Configuration |
|---|---|---|
| mdlib-pure | CommonMark | `createMarkdown({ html: true, allowUrl: () => true, decodeEntity })` |
| marked | CommonMark | `new Marked({ gfm: false })` |
| markdown-it | CommonMark | `markdownit('commonmark')` + `md.validateLink = () => true` |
| commonmark.js | CommonMark | `new Parser()` + `new HtmlRenderer()` (default `safe: false`) |
| micromark | CommonMark | `micromark(s, { allowDangerousHtml: true, allowDangerousProtocol: true })` |
| snarkdown | CommonMark | `snarkdown(s)` (no options) |
| mdlib-pure + gfm() | GFM | as above + `plugins: gfm()` |
| marked | GFM | `new Marked()` (default `gfm: true`) |
| markdown-it | GFM | `markdownit({ html: true, linkify: true })` + `md.validateLink = () => true` |
| micromark + gfm | GFM | as above + `extensions: [gfm()], htmlExtensions: [gfmHtml()]` |

Every parser/renderer instance, option object and extension list is created
**once** and reused for every document, as the libraries are meant to be used.

### Options: same work for every library

- **Raw HTML is allowed** everywhere. It is the CommonMark default, what the
  spec examples assume, and the only setting every library supports (marked
  and snarkdown cannot disable it).
- **URL filtering is off** everywhere (`allowUrl`, `validateLink`,
  `allowDangerousProtocol`). marked, commonmark.js (default) and snarkdown
  have no filter at all, so this is the only way to make them all do the same
  work. The filters run once per link or image and are cheap: turning them
  on cost ~2% on the link-heavy README-like input for both mdlib-pure
  (`isSafeUrl`) and markdown-it (`validateLink`) in a separate check.
- **Named entities** (`&copy;`): in Node, mdlib-pure needs
  `decodeEntity` from `mdlib-pure/entities`, since its default decoder uses
  the DOM. The other libraries decode with their own bundled tables (marked
  leaves references in the output for the browser to decode).

Defaults differ a lot, which matters if you compare "out of the box" behaviour
instead (not benchmarked):

| Library | Raw HTML by default | URL policy by default |
|---|---|---|
| mdlib-pure | not recognized (shown as text) | allowlist `http`, `https`, `mailto`, `tel`, `sms`, relative; `data:image/(png\|gif\|jpeg\|webp)` for images only; otherwise `href=""` |
| marked | passed through | none: sanitize the output yourself |
| markdown-it | escaped (`'default'` preset); passed through in the `'commonmark'` preset | blocks `javascript:`, `vbscript:`, `file:`, `data:` (except `data:image/(gif\|png\|jpeg\|webp)`): the link is not created |
| commonmark.js | passed through (`safe: true` replaces it with a comment) | none (`safe: true` blanks `javascript:`, `vbscript:`, `file:`, `data:` except raster images) |
| micromark | escaped | `href`: `http(s)`, `mailto`, `irc(s)`, `xmpp`, relative; `src`: `http(s)`, relative; otherwise `href=""` |
| snarkdown | passed through, and text is not escaped at all | none |

### GFM features differ between the GFM rows

| | tables | strikethrough | autolink literals | task lists | footnotes | tag filter | alerts |
|---|---|---|---|---|---|---|---|
| mdlib-pure + `gfm()` | yes | yes | yes | yes | yes | yes | yes |
| marked (`gfm: true`) | yes | yes | yes | yes | no | no | no |
| markdown-it (default + `linkify`) | yes | yes (`<s>`) | URLs with a scheme and emails (linkify-it 6 has `fuzzyLink: false`, so bare `www.` is not linked) | no (plugin) | no (plugin) | no | no |
| micromark + gfm | yes | yes | yes | yes | yes | yes | no |

So in GFM mode mdlib-pure does the most work per document: it runs seven
plugins, including transforms that walk the whole tree.

## Method

### 1. Throughput

- **Inputs:** (a) `fixtures/spec.txt`, the CommonMark spec source (~200 KB of
  prose, code blocks and HTML snippets); (b) `fixtures/readme.md`, ~8 KB with
  headings, nested lists, fenced code, inline/reference links, badges, tables,
  emphasis, block quotes, a task list and a bit of HTML; (c) the markdown of
  the 652 spec examples from `test/fixtures/commonmark-0.31.2.json`, rendered
  one by one (per-document overhead and edge cases).
- **Timing:** `process.hrtime.bigint()` around a loop of `render(doc)` calls
  (the output length is accumulated into a sink, so no call can be dropped).
- **Warm-up:** each library renders each input for 1.5 s (at least 5 passes),
  which also calibrates how many passes make a sample of ~250 ms.
- **Samples:** 15 rounds. In every round each library takes one sample;
  the order is rotated each round so thermal or frequency drift does not
  favour any library. A full GC runs before every sample (exposed at runtime
  with `v8.setFlagsFromString('--expose-gc')`), so no library pays for the
  garbage of the previous one; GC triggered by a library's own allocations is
  part of its time.
- **Report:** the median sample; `±` is half the interquartile range relative
  to the median. MB/s for (a) and (b) (10^6 bytes of UTF-8 input per second),
  thousands of documents per second for (c).
- **Same process:** all libraries run sequentially in one Node process
  (see the caveats for a cross-check with one process per library).
- **Sanity check:** before timing, every library renders every input and must
  return a non-empty string; HTML output sizes are reported next to the
  results, so a library that silently does less work would stand out.

### 2. Bundle size

Each row has a browser entry that imports the library as its README shows,
creates an instance and exports a `render` function (see `bundle` in
`libs.js`), so every library gets the same tree-shaking. It is bundled with
esbuild (`bundle: true, platform: 'browser', format: 'esm', minify: true,
legalComments: 'none'`, default target, so no syntax lowering), then
gzipped at level 9. `mdlib-pure` and `mdlib-pure/*` resolve through the
repo's `exports` map to `dist/`, as for a consumer. The `platform: 'browser'`
setting matters: micromark's entity decoder has a DOM-based browser build.

The "Named entities" column explains most of the differences: commonmark.js
bundles the full `entities` 3 tables (~114 KB of its 156 KB minified),
markdown-it bundles ~21 KB of `entities`, while mdlib-pure and micromark use
the DOM and marked does not decode at all. The `mdlib-pure + /entities` row
shows mdlib-pure with its own table, which you only need without a DOM.

### 3. Conformance

All 652 examples of CommonMark 0.31.2, with the options above. "Exact" is
string equality with the spec's HTML. "Normalized" compares after the same
normalization as `test/helpers.ts`: attributes sorted, `attr=""` → `attr`,
self-closing slash removed (`<br />` → `<br>`, `<hr />` → `<hr>`), tag names
lowercased, whitespace between tags removed. It removes serialization-style
differences only: escaping and entity differences (e.g. marked's `&#39;`)
still count as failures. An exception counts as a failure. (Checked: only 5
of marked's 52 normalized failures go away if quote escaping is also
normalized; the rest are real parsing differences, mostly in lists, hard
line breaks and entities.)

GFM rows are expected to lose a few CommonMark examples where GFM
intentionally differs: the tag filter (`<script>`, `<textarea>`, `<style>`…)
and extended autolinks inside `<…>`. GFM spec conformance is not measured:
footnote and alert HTML differ between implementations by design.

## Caveats

- **One machine, one runtime.** Numbers are from one Node/V8 version on one
  CPU with frequency scaling (laptop/mini-PC class, `powersave` governor with
  boost, not pinned to a core). Absolute numbers move by 5-10% between runs;
  the ratios are more stable. Browsers were not measured: other engines
  (JavaScriptCore, SpiderMonkey) can rank the libraries differently.
- **JIT history matters.** V8 optimizes for the types and paths it has seen,
  so a library's speed on one input depends a little on what it rendered
  before (rendering the 652 examples first cost 5-10% on `spec.txt` in a
  separate test). All libraries get the same history here (sanity check,
  then the inputs in the same order). `--quick` warms up too briefly and
  underestimates libraries that need longer to reach optimized code.
- **Same process vs. one process per library.** Cross-check made right after
  the run in RESULTS.md (same machine, 2026-10-28): each row re-run alone
  with `node bench/run.js --only=throughput --libs=<id>`. Medians in MB/s
  (k docs/s for the examples), in-process / alone:

  | Row | spec.txt | README-like | 652 examples |
  |---|---:|---:|---:|
  | mdlib-pure | 39.6 / 39.5 (-0%) | 32.6 / 35.2 (+8%) | 302 / 321 (+6%) |
  | marked | 44.2 / 43.3 (-2%) | 32.7 / 32.8 (+0%) | 312 / 320 (+3%) |
  | markdown-it | 35.9 / 37.9 (+6%) | 22.0 / 23.7 (+8%) | 228 / 230 (+1%) |
  | commonmark.js | 47.1 / 45.9 (-3%) | 47.8 / 50.9 (+7%) | 440 / 462 (+5%) |
  | micromark | 2.04 / 2.19 (+8%) | 2.67 / 2.36 (-12%) | 21.2 / 14.9 (-30%) |
  | snarkdown | 4.37 / 4.43 (+1%) | 64.7 / 63.2 (-2%) | 802 / 817 (+2%) |
  | mdlib-pure + gfm() | 31.1 / 31.2 (+0%) | 20.6 / 21.3 (+4%) | 242 / 247 (+2%) |
  | marked (GFM) | 38.7 / 38.1 (-2%) | 27.5 / 27.4 (-1%) | 288 / 293 (+2%) |
  | markdown-it (GFM) | 28.7 / 29.9 (+4%) | 17.3 / 18.3 (+6%) | 206 / 208 (+1%) |
  | micromark + gfm | 1.55 / 1.79 (+16%) | 1.63 / 1.55 (-5%) | 14.5 / 11.5 (-21%) |

  Running everything in one process costs every library 0-8%, and roughly
  equally, so the ratios move by a few percent at most. micromark is the
  exception: its speed on small documents changes by ±20-30% from one
  process to the next (also between two full runs), in both directions.
  Treat its numbers as an order of magnitude only.
  The within-run `±` understates run-to-run variation: differences under
  ~10% between libraries are not significant.
- **Only the string path.** `md.render()` to an HTML string. mdlib-pure's
  `renderTo()` (DOM nodes without HTML parsing) and the framework adapter are
  not measured; nor are the libraries' AST/token APIs on their own.
- **Entities in Node vs. browser.** In Node mdlib-pure decodes entities with
  a `Map`; in a browser it uses the DOM, which is slower per entity. The
  inputs contain few entities, so this barely matters here.
- **`spec.txt` is unusual.** It is full of code blocks and HTML snippets,
  which stress escaping (`&`, `<`, `>`) more than typical prose. The
  README-like input is closer to everyday documents; the 652 examples are
  tiny and stress per-document setup costs and edge cases.
- **snarkdown** is not a CommonMark implementation: its output is wrong for
  most inputs and it does not escape text, so it is only a size/speed floor.
  It is fast on small documents but slows down on large ones.
- **micromark** is slow by design (a character-level state machine that
  produces a concrete syntax tree with positions, used by remark/mdast). This is
  not a misconfiguration: Node resolves its production build (`default`
  export condition), not the `development` one with assertions.
- **GFM rows do different amounts of work** (see the feature table): compare
  them with that in mind.
- **Conformance is CommonMark only** and says nothing about security or about
  GFM behaviour.

## License

- `fixtures/spec.txt`: the CommonMark Spec 0.31.2, © John MacFarlane,
  licensed under [CC-BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/),
  downloaded unmodified from <https://spec.commonmark.org/0.31.2/spec.txt>
  (sha256 `bfef4ddc97276b6ab6c2a28ace48478e35b1c50e60cde9f517ab8ab030aa3b82`,
  checked by `run.js`, which also downloads it if missing).
- `fixtures/readme.md` (fictional project, written for this benchmark) and
  the benchmark code: MIT, like the rest of the repository.
- The 652 examples are read from `test/fixtures/commonmark-0.31.2.json`
  (CC-BY-SA 4.0, see `test/fixtures/README.md`).

[marked]: https://github.com/markedjs/marked
[markdown-it]: https://github.com/markdown-it/markdown-it
[commonmark]: https://github.com/commonmark/commonmark.js
[micromark]: https://github.com/micromark/micromark
[micromark-extension-gfm]: https://github.com/micromark/micromark-extension-gfm
[snarkdown]: https://github.com/developit/snarkdown
