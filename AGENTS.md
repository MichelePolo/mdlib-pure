# AGENTS.md: guide for AI coding agents

This file is the single source of truth for agents (Claude Code, Codex,
Cursor, Copilot, Gemini…) working on **mdlib-pure**: a zero-dependency,
CommonMark-compliant Markdown renderer for the browser, extended through
plugins and styled with semantic CSS tokens.

Read it fully before changing code. Human-oriented docs live in `docs/`.

## Non-negotiable rules

Each rule has a command that verifies it. Run `npm run verify` before you
declare any task done; it runs all of them.

| # | Rule | Verified by |
|---|------|-------------|
| 1 | **Zero runtime dependencies.** Never add `dependencies`/`peerDependencies`, never import packages from `src/`. | `npm run check` |
| 2 | **CommonMark conformance stays at 652/652.** | `npm run spec` |
| 3 | **Size budgets hold** (core ≤ 15 KB gzip). Raising a budget is a design decision for the maintainer, not a fix. | `npm run size` |
| 4 | **No HTML sinks** (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`…) except lines marked `// check:allow-innerHTML` with a justification. Text goes through `createTextNode`/escaping, URLs through `r.url()`. | `npm run check` |
| 5 | **Erasable TypeScript only**: no `enum`, `namespace`, parameter properties. Node runs the sources directly. | `npm run typecheck` |
| 6 | **Every new syntax ships with tests**, including adversarial input (see `test/pathological.test.ts`). Parsing must stay linear. | `npm test` |
| 7 | **CSS tokens are semantic** (`--md-color-link`), never primitive (`--md-blue-500`). | review |
| 8 | **Regexes must be linear** on any input: no alternatives that can match the same text inside a quantifier (`(?:\\.|\\[^x])*`), no unanchored `x+$`/`x*$` (scan by hand instead), always `y`/`g` + `lastIndex` instead of `slice(pos)`. | `test/pathological.test.ts` |
| 9 | **Lookups keyed by input use `Map` or `Object.hasOwn`**, never a plain object (`&constructor;` must not reach `Object.prototype`). | review + tests |
| 10 | **Docs stay complete for humans and agents.** Every public entry point (`exports` in package.json) is documented in `docs/api.md` and mentioned in `README.md`; every `docs/*.md` and `bindings/*/README.md` is linked from `README.md`. The website, `llms.txt` and `llms-full.txt` are generated from these files: never edit generated copies. | `npm run check` |

**Browser support:** Baseline 2024. Features Baseline-available in 2024 or
earlier (`light-dark()`, `color-mix()`, `:has()`, `text-wrap: balance`, CSS
nesting, `Object.hasOwn`, regex `\p{…}`) are used without fallbacks. Newer
features need feature detection and a graceful fallback.

## Distribution: nothing is on a registry yet

`mdlib-pure` and `ngx-mdlib-pure` are **not on the npm registry**, and
`MdlibPure.Blazor` is **not on nuget.org**. When you write install
instructions, set up an app or answer a user:

- never suggest `npm install mdlib-pure`, `npm install ngx-mdlib-pure` or
  `dotnet add package MdlibPure.Blazor` from the public registries: they fail;
- mdlib-pure: the tarball on the GitHub release `mdlib-pure-v0.1.1`
  (`npm install https://github.com/MichelePolo/mdlib-pure/releases/download/mdlib-pure-v0.1.1/mdlib-pure-0.1.1.tgz`),
  or `npm pack` in a clone (`prepack` builds `dist/`) (README.md, "Install");
- Angular: that tarball plus `ngx-mdlib-pure-0.1.0.tgz` from the GitHub
  release `angular-v0.1.0`, or `npm run angular:pack`
  (bindings/angular/README.md, "Install");
- Blazor: the `.nupkg` attached to the GitHub release `blazor-v0.1.0`, from a
  local NuGet feed (bindings/blazor/README.md, "Install");
- never publish: no `npm publish`, no `v*` tags (`.github/workflows/release.yml`
  publishes to npm on them), no `dotnet nuget push`, no new GitHub releases
  or replaced release assets (lockfiles pin their checksums). Publishing is
  the maintainer's decision.

When a package is published, update this section, `README.md`, the
`bindings/*/README.md` and the site in the same commit.

## Commands

```sh
npm ci              # once, on a fresh checkout (dev tools only: esbuild, typescript)
npm test            # all tests (node:test, runs TypeScript directly)
npm run test:browser  # DOM path + theme in Chromium (once: npx playwright install chromium)
npm run spec        # CommonMark report per section
npm run spec -- 42  # show expected/actual for example 42
npm run typecheck
npm run check       # invariants: zero deps, no HTML sinks
npm run size        # gzip budgets
npm run build       # dist/ (esbuild + .d.ts)
npm run verify      # all of the above except build

# Blazor wrapper (bindings/blazor, needs the .NET 10 SDK). Re-run blazor:assets
# after changing src/ or styles/: the NuGet package bundles them.
npm run blazor:assets # bindings/blazor/src/MdlibPure.Blazor/wwwroot/dist/ (elements, service, styles, KaTeX, Mermaid)
(cd bindings/blazor && dotnet test)   # bUnit tests (builds the .NET projects)
npm run test:blazor   # end to end in Chromium: builds and runs the demo, every render mode

# Angular wrapper (bindings/angular, own package.json and lockfile). The Angular
# CLI 22 needs Node ^22.22.3 || ^24.15 || >=26. The workspace links the repo's
# dist/ ("mdlib-pure": "file:../.."): rebuild after changing src/ or styles/.
npm ci --prefix bindings/angular   # once
npm run angular:build # mdlib-pure dist/, then the ngx-mdlib-pure package and the SSR demo
npm run angular:unit  # library unit tests: Vitest in Chromium via Angular's unit-test builder
npm run test:angular  # end to end in Chromium: builds and serves the SSR demo (server HTML, hydration, forms)
npm run angular:pack  # tarballs of mdlib-pure and ngx-mdlib-pure in bindings/angular/dist/
```

## Map of the code

```
src/
  index.ts            createMarkdown(): wires rules, parser, renderer
  types.ts            AST node types + plugin contracts (BlockRule, InlineRule, DelimiterRule, Plugin)
  block/parser.ts     BlockParser (line-by-line algorithm) and Block (block under construction)
  block/rules.ts      core block rules; ORDER OF `start` RULES = PRECEDENCE
  inline/parser.ts    InlineParser: dispatch by trigger char, delimiter stack, links
  inline/rules.ts     core inline rules (thin wrappers around InlineParser methods)
  render/vnode.ts     h(), raw(), RenderContext
  render/renderer.ts  AST → VNodes (coreRenderers, classes map)
  render/html.ts      VNodes → HTML string (CommonMark-exact newlines)
  render/dom.ts       VNodes → DOM without parsing HTML
  util/               escaping, entities, URL normalization and safety policy, visit()
  entities/           optional full entity table (`mdlib-pure/entities`)
  gfm/                GFM plugins (`mdlib-pure/gfm`): table, autolink, footnotes, …
  plugins/            other first-party plugins, one entry each (`mdlib-pure/<name>`): container,
                      headings, math, mermaid, deflist, mark, frontmatter
  adapter.ts          VNodes → React/Preact/Vue elements (`mdlib-pure/adapter`)
styles/               theme.css (tokens), tailwind.css (Tailwind v4 bridge)
docs/                 api.md, elements.md (Web Components), tokens.md, security.md, screenshots/
templates/plugin/     a complete tested plugin to copy (runs in `npm test`)
demo/                 the first live editor (needs `npm run build`)
site/                 the website: `npm run site:build` → site/out/ (pages, samples, playground)
bench/                benchmark against other libraries (own package.json)
bindings/blazor/      Blazor wrapper, NuGet package MdlibPure.Blazor (.NET 10, own README):
  src/MdlibPure.Blazor/   Razor components over the elements (<Markdown>, <MarkdownEditor>),
                          IMarkdownService (AST/TOC/HTML via JS interop), JS initializer;
                          wwwroot/dist/ is generated by `npm run blazor:assets` (gitignored)
  samples/                demo Blazor Web App, one page per render mode
  tests/                  bUnit tests
bindings/angular/     Angular wrapper, npm package ngx-mdlib-pure (Angular CLI workspace, own README):
  projects/ngx-mdlib-pure/  standalone components whose host IS the element (MarkdownEditor =
                          <mdlib-editor>, ControlValueAccessor; MarkdownViewer = <mdlib-markdown>),
                          provideMdlibPure() (defines the elements in the browser only),
                          MarkdownService (parse/toc/render via getMarkdown, server included);
                          *.spec.ts run in Chromium
  demo/                   SSR demo app (zoneless): editor page, forms page (lazy route)
test/
  spec.test.ts        the 652 CommonMark examples
  gfm.test.ts         GFM extension examples
  api.test.ts         options, AST shape, plugin examples
  container.test.ts   a full block-container plugin test suite (good model)
  adapter.test.ts     whole corpus through real React 19, zero warnings
  mermaid.test.ts     a plugin that integrates an external library (Node side)
  helpers.ts          shared test helpers (HTML normalization, budget())
  browser/            Chromium suite (npm run test:browser): DOM path, theme, real
                      Tailwind v4 build, KaTeX auto-render, real Mermaid
  blazor/             Blazor wrapper end to end (npm run test:blazor): the demo app in
                      Chromium, every render mode, enhanced navigation
  angular/            Angular wrapper end to end (npm run test:angular): the SSR demo in
                      Chromium, server HTML, hydration, typing, forms, client navigation
  pathological.test.ts  linear-time guarantees
```

## How parsing works (what you need to extend it)

1. **Block phase** (`BlockParser`). For each line: every open block's
   `continue` is asked whether the line continues it; then `start` rules are
   tried in order; leftover text goes to the open leaf or a new paragraph.
   Blocks are `Block` objects; each has a `node` (its future AST node) and a
   private `data` bag.
2. **Inline phase** (`InlineParser`). Each block whose rule has
   `content: 'inline'` gets its text parsed. At every *trigger character* the
   rules registered for it are tried in order; text between triggers is
   consumed in one regex step.
3. **Transforms** (`plugin.transform`) run on the finished AST. Use
   `visit()` to walk it, and `ctx.parseInline(text)` to turn text into
   inline nodes (e.g. Markdown in a node property such as a title).
4. **Render**: AST → VNodes via render functions keyed by node type → HTML
   string or DOM.

**Per-parse state.** Plugin objects are shared by every parse, so never keep
document state in them. Use `env`: one object per parse, available as `p.env`
in block and inline rules and `ctx.env` in transforms. Namespace keys
(`'footnotes'`, `'container:scan'`). Example: footnote definitions are
registered in the block phase and looked up in the inline phase.

## Choosing the extension point

```
Does the syntax change how lines group into blocks?
├─ yes → BlockRule (block[])                    e.g. $$ math, ::: containers, tables
└─ no → Is it marked by a symmetric run like ** or ~~ ?
        ├─ yes → DelimiterRule (delimiters[])    e.g. ~~strike~~, ==mark==
        └─ no → Does it start at a specific char?
                ├─ yes → InlineRule (inline[])   e.g. @mention, :emoji:, [^footnote]
                └─ no → transform               e.g. bare URL autolinking, heading ids
Only the HTML output changes? → render override (render{}), no parsing at all.
```

## Recipes

### Inline rule

```ts
const mention: Plugin = {
  name: 'mention',
  inline: [{
    name: 'mention',
    triggers: '@',                        // dispatch chars: keep them few
    parse(p) {                            // p: InlineParser
      const m = p.match(/@([a-z0-9_]+)/y) // sticky regex at p.pos; advances on match
      if (!m) return false                // return false WITHOUT consuming
      p.push({ type: 'mention', user: m.slice(1) })
      return true
    },
  }],
  render: { mention: (n, r) => r.h('a', { href: r.url(`/u/${n.user}`, 'link') }, `@${n.user}`) },
}
```

- `p.match(re)` requires a `y` (sticky) or `g` regex. Never `src.slice(pos)`
  in a loop: that is O(n²).
- Nested inline content: `p.parse(text)` returns `Node[]` (re-entrant).
- `p.inBracket()` is true inside potential link/image text: rules that create
  links must not fire there (no links in links).
- Every trigger character costs a dispatch each time it appears, whether
  the rule matches or not: prefer rare characters (`@`, `:`, `$`) to letters.
  When the syntax is only recognizable late (a URL scheme at `:`), fire on the
  rare character and take back the text already emitted with
  `p.trimText(suffix)` (see `gfm/autolink.ts`).
- Rules for the same char run in order; use `before`/`after` to position
  relative to a core rule (`codeSpan`, `openBracket`, `autolink`…).

### Delimiter rule

```ts
{ name: 'mark', delimiters: [{ char: '=', type: 'mark', sizes: [2] }],
  render: { mark: (n, r) => r.h('mark', null, r.children(n)) } }
```

Opener and closer must have equal length, listed in `sizes`. Flanking rules
are the same as `*`.

### Block rule

A rule with `start` opens blocks; a rule with `continue` defines a block
type. One object can do both. Models: the `$$` math leaf in
`test/api.test.ts`, the `:::` container in `src/plugins/container.ts`.

**Results**

- `start(p, container)` returns `0` (no match), `1` (container opened: keep
  trying starts inside it) or `2` (leaf opened, or the line is otherwise fully
  handled: stop). Call `p.closeUnmatchedBlocks()` before `p.addChild(...)`.
- `continue(p, block)` returns `0` (line continues the block), `1` (it does
  not: the block will be closed) or `2` (line fully consumed, e.g. a closing
  fence: call `p.finalize(block, p.lineNumber)` first). `finalize` also closes
  the block's open children, ending them on the previous line.

**Shape**

- `acceptsLines: true` appends remaining text to `block.content` (leaves).
- `content: 'inline'` parses `block.content` as inlines into `node.children`;
  `content: 'block'` makes child blocks the children (containers).
- **Containers need `canContain(type)`.** The default is "nothing": `addChild`
  then silently closes your block and attaches the child to its parent. Most
  containers want `(t) => t !== 'listItem'`.
- Set AST properties on `block.node`; keep parser state in `block.data`.
- **`endLine` matters**: lists are tight or loose depending on line gaps
  between sibling blocks. A container closed by the end of its parent should
  end at its last child: in `finalize`, `b.endLine = b.lastChild?.endLine ??
  b.startLine` (like `listItem`).

**Order and dispatch**

- `triggers` lists the chars a block can start with (after indentation); the
  rule is skipped on other lines. Without `triggers` the rule is tried on every
  line (only that rule pays). `''` = only on indented lines.
- Rules without `before`/`after` are appended **after all core rules and
  after earlier plugins' rules**. The GFM table rule has no triggers and takes
  every line inside a table as a row, so give your start an anchor
  (`before: 'fencedCode'`). Core start order: `blockquote, atxHeading,
  fencedCode, htmlBlock, setextHeading, thematicBreak, listItem,
  indentedCode`.
- Container rules must refuse to start when `container.depth >= MAX_NESTING`
  (`import { MAX_NESTING } from 'mdlib-pure'`; inside this repo,
  `'../block/parser.ts'`).

**Containers with a closing marker** (`:::`, `+++`…)

- `continue` runs on every open block, **outer containers first**. If a
  container closes itself in `continue`, it steals lines that belong to its
  children (a `:::` inside a fenced code block in the container).
- Pattern: in `continue`, only *record* that the line is your closer and
  return `0`; do the closing in `start`, which the parser skips while the
  deepest open block takes raw lines (code). See `src/plugins/container.ts`.

**Performance**

- Timing tests assert `ms < budget(2000)` (`test/helpers.ts`): the limit is
  tripled on CI, whose machines are slower. Size inputs so they run in a few
  hundred ms locally; a quadratic regression still blows past the limit.
- Never read the end of a string you keep appending to (`endsWith`,
  `charCodeAt`, `slice`) inside a loop: V8 flattens the growing string each
  time, which is O(n²). Keep separate pieces instead.
- `continue` runs once per open block per line, so per-line work there is
  multiplied by nesting depth (up to `MAX_NESTING`). Memoize per line in
  `p.env` (see `scan()` in `container.ts`). Time-based tests miss constant
  factor regressions like this: also test deep nesting explicitly.

### Render override

```ts
{ name: 'ext-links', render: {
  link: (n, r) => r.h('a', { href: r.url(n.url as string, 'link'), rel: 'noopener' }, r.children(n)),
} }
```

- Always pass URLs through `r.url(url, kind)`: it applies the safety policy.
- Text children are plain strings: the serializer escapes them. Use
  `r.raw(html)` only for trusted HTML (it forces the string path in
  `renderTo`).
- `r.parent` is the parent node. A parent with `spread: false` renders its
  paragraphs without `<p>` (tight lists): set `node.spread` on your own
  containers to get the same behavior.

## Integrating an external library (diagrams, math, charts)

Libraries like Mermaid (~215 KB gzip at first load) or KaTeX must never
become dependencies. The pattern of `mdlib-pure/mermaid` and
`mdlib-pure/math`:

1. Parse into your own node (`mermaid { value }`). Fenced blocks need no new
   syntax: convert `code` nodes with your `lang` in a transform.
2. Render the markup the library already recognizes (`<pre class="mermaid">`,
   `\(…\)`): pages that load the library need no configuration, and without
   JavaScript the source stays readable.
3. Offer `render(source)` for pre-rendered output: a string is trusted HTML,
   VNodes are safe, `null` keeps the default (like the core `highlight`).
4. A browser helper takes `load: () => import('lib')` and calls it only when
   the page has your nodes. Never hard-code a CDN URL.
5. The library writes to the DOM outside mdlib-pure's safe path: default to
   its strictest mode and document it in `docs/security.md`.
6. Test the Node side in `test/<name>.test.ts` and the real library in
   `test/browser/` (as a dev dependency only).

## Adding a first-party plugin

1. Code in `src/plugins/<name>.ts` (or `src/<name>/` if it has several files).
   Start with a header comment: syntax, AST node shape, HTML output (see
   `container.ts`).
2. Tests in `test/<name>.test.ts`: positive, negative, interaction with core
   and GFM (in both plugin orders), AST shape, adversarial input.
3. Wire it: entry in `scripts/build.js`, budget in `scripts/size.js`
   (`external: true`), export in `package.json`.
4. Docs: a section in `docs/api.md`, a line in `README.md` and
   `CHANGELOG.md`; styles in `styles/theme.css` if it renders new elements.
5. Site: register it in `site/lib/plugins.js` (`playground: false` if it
   needs a loader the playground does not have), add it to
   `site/build/sizes.js`, a card in `site/build/pages/plugins.js`, a sample in
   `site/content/samples/` and `site/lib/samples.js`.

`templates/plugin/` is the same structure for a minimal inline plugin.

## Definition of done

- [ ] `npm run verify` passes (typecheck, tests, check, size)
- [ ] DOM, rendering or CSS changes: `npm run test:browser` passes (CI runs both)
- [ ] new syntax: positive tests, negative tests, adversarial-input test
- [ ] new node types documented in the plugin's header comment (AST shape)
- [ ] new tokens documented in `docs/tokens.md`
- [ ] new plugin: docs and site updated, `npm run site:build` passes (it fails
      on broken internal links)
- [ ] any change to behavior or API: the human docs (`README.md`, `docs/*.md`,
      `bindings/*/README.md`) and this file say the same thing, in the same
      commit
- [ ] no behavior change to core output unless the task requires it

## CSS (styles/)

- Every rule is in `@layer mdlib` inside `:where()`: zero specificity, so
  **source order decides** between theme rules. Edge resets
  (`:first-child`/`:last-child` margins) must stay at the end of the file.
- Tokens: semantic names only (rule 7); document each in `docs/tokens.md`.
- First-party plugins that render new elements are styled in `theme.css`
  (containers, alerts, definition lists, diagrams), with existing tokens.

## Things that look wrong but are intentional

- `html: false` by default: HTML is not *recognized*, so it renders as text
  and Markdown inside it still works. This is safer and more predictable than
  stripping tags.
- Soft line breaks are `\n` inside `text` nodes (mdast style), not nodes.
- Named entities are decoded via the DOM in browsers; Node needs
  `mdlib-pure/entities`. The default decoder outside the DOM knows only
  `amp lt gt quot apos nbsp`.
- `MAX_NESTING` (100) silently turns deeper markers into text: it protects
  the call stack from adversarial input.
