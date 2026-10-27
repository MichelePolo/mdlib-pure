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
| 3 | **Size budgets hold** (core ≤ 11 KB gzip). Raising a budget is a design decision for the maintainer, not a fix. | `npm run size` |
| 4 | **No HTML sinks** (`innerHTML`, `outerHTML`, `insertAdjacentHTML`, `eval`…) except lines marked `// check:allow-innerHTML` with a justification. Text goes through `createTextNode`/escaping, URLs through `r.url()`. | `npm run check` |
| 5 | **Erasable TypeScript only**: no `enum`, `namespace`, parameter properties. Node runs the sources directly. | `npm run typecheck` |
| 6 | **Every new syntax ships with tests**, including adversarial input (see `test/pathological.test.ts`). Parsing must stay linear. | `npm test` |
| 7 | **CSS tokens are semantic** (`--md-color-link`), never primitive (`--md-blue-500`). | review |
| 8 | **Regexes must be linear** on any input: no alternatives that can match the same text inside a quantifier (`(?:\\.|\\[^x])*`), no unanchored `x+$`/`x*$` (scan by hand instead), always `y`/`g` + `lastIndex` instead of `slice(pos)`. | `test/pathological.test.ts` |
| 9 | **Lookups keyed by input use `Map` or `Object.hasOwn`**, never a plain object (`&constructor;` must not reach `Object.prototype`). | review + tests |

**Browser support:** Baseline 2024. Features Baseline-available in 2024 or
earlier (`light-dark()`, `color-mix()`, `:has()`, `text-wrap: balance`, CSS
nesting, `Object.hasOwn`, regex `\p{…}`) are used without fallbacks. Newer
features need feature detection and a graceful fallback.

## Commands

```sh
npm test            # all tests (node:test, runs TypeScript directly)
npm run spec        # CommonMark report per section
npm run spec -- 42  # show expected/actual for example 42
npm run typecheck
npm run check       # invariants: zero deps, no HTML sinks
npm run size        # gzip budgets
npm run build       # dist/ (esbuild + .d.ts)
npm run verify      # all of the above except build
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
  util/               escaping, entities, URL normalization and safety policy
  entities/           optional full entity table (`mdlib-pure/entities`)
test/
  spec.test.ts        the 652 CommonMark examples
  api.test.ts         options, AST shape, plugin examples (good templates!)
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
3. **Transforms** (`plugin.transform`) run on the finished AST.
4. **Render**: AST → VNodes via render functions keyed by node type → HTML
   string or DOM.

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
type. One object can do both (see the `$$` math example in
`test/api.test.ts`).

- `start(p, container)` returns `0` (no match), `1` (container opened) or
  `2` (leaf opened). Before `p.addChild(...)`, call `p.closeUnmatchedBlocks()`.
- `continue(p, block)` returns `0` (line continues the block), `1` (it does
  not; the block will be closed) or `2` (line fully consumed, e.g. a closing
  fence: call `p.finalize(block, p.lineNumber)` first).
- `acceptsLines: true` appends remaining text to `block.content`.
- `content: 'inline'` parses `block.content` as inlines into `node.children`;
  `content: 'block'` makes child blocks the children.
- Set AST properties on `block.node`; keep parser state in `block.data`.
- `triggers` lists the chars a block can start with. Omitting it disables a
  fast path for every line: always provide it (`''` = only indented lines).
- Container rules must refuse to start when `container.depth >= MAX_NESTING`.
- Order matters: use `before: 'fencedCode'` etc. Core start order is
  `blockquote, atxHeading, fencedCode, htmlBlock, setextHeading,
  thematicBreak, listItem, indentedCode`.

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
- `r.parent` is the parent node (e.g. paragraphs check for tight lists).

## Definition of done

- [ ] `npm run verify` passes (typecheck, tests, check, size)
- [ ] new syntax: positive tests, negative tests, adversarial-input test
- [ ] new node types documented in the plugin's README/JSDoc (AST shape)
- [ ] new tokens documented in `docs/tokens.md`
- [ ] no behavior change to core output unless the task requires it

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
