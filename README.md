# mdlib-pure

Lightweight Markdown renderer for the browser.

- **100% CommonMark 0.31.2**: all 652 spec examples pass
- **GFM** as an opt-in plugin (~4 KB): tables, strikethrough, autolinks, task lists, footnotes, alerts. 54/54 GFM extension examples pass
- **Zero dependencies**, ~10 KB gzipped core
- **Safe by default**: raw HTML off, `javascript:` URLs blocked, DOM output without HTML parsing
- **Extensible**: block, inline and delimiter rules, AST transforms, render overrides
- **Framework-neutral output**: HTML string, DOM nodes, or React/Vue/Preact elements
- **Tailwind-friendly**: semantic HTML with no classes by default, or a class map per node type
- **Linear time** on adversarial input
- MIT licensed

## Usage

```js
import { createMarkdown } from 'mdlib-pure'

const md = createMarkdown()

md.render('# Hello *world*')          // '<h1>Hello <em>world</em></h1>\n'
md.renderTo(element, '# Hello')       // builds DOM nodes directly
md.parse('# Hello')                   // mdast-style AST
```

### Options

```js
createMarkdown({
  plugins: [],            // see "Plugins"
  html: false,            // recognize raw HTML (trusted input only, or with sanitize)
  sanitize: undefined,    // (html) => html, e.g. DOMPurify.sanitize
  allowUrl: isSafeUrl,    // (url, 'link' | 'image') => boolean
  decodeEntity: undefined,// named-entity decoder (default: the browser's DOM)
  classes: {},            // CSS classes per node type
  attributes: undefined,  // (node) => extra attributes, e.g. data-sourcepos
  highlight: undefined,   // (code, lang, meta) => html | VNodes | null
  positions: false,       // line/column/offset on block nodes
})
```

Full reference: [docs/api.md](docs/api.md).

### GitHub Flavored Markdown

```js
import { createMarkdown } from 'mdlib-pure'
import { gfm } from 'mdlib-pure/gfm'

const md = createMarkdown({ plugins: gfm() })
// turn parts off: gfm({ footnotes: false, alerts: false })
```

Also exported one by one: `table`, `strikethrough`, `autolink`, `tasklist`,
`footnotes`, `tagfilter`, `alerts`.

### Syntax highlighting

Bring your own highlighter through `highlight(code, lang, meta)`:

```js
import hljs from 'highlight.js/lib/core'
createMarkdown({
  // a string is trusted HTML for inside <code>
  highlight: (code, lang) => (lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : null),
})

// shiki returns a whole <pre>: it replaces the block
createMarkdown({ highlight: (code, lang) => shiki.codeToHtml(code, { lang: lang ?? 'text', theme: 'github-dark' }) })
```

Return `null` for the default rendering, or VNodes (`h('span', { class: 'kw' }, 'let')`)
to stay on the DOM-safe path of `renderTo()`. Strings are treated as trusted
HTML: with untrusted input, use a highlighter that escapes code (all of the
above do) or set `sanitize`.

### React, Vue, Preact

```jsx
import { createElement } from 'react'
import { toElements } from 'mdlib-pure/adapter'

<article className="md">{toElements(md.toVNodes(src), createElement, 'react')}</article>
// Vue: toElements(vnodes, h, 'vue') · Preact: toElements(vnodes, h, 'preact')
```

The adapter applies each framework's conventions (`className`, uncontrolled
checkboxes, Vue's array children, `dangerouslySetInnerHTML`/`innerHTML` for
trusted raw HTML from `highlight`). Tested against the real React 19 on all
CommonMark and GFM examples. With `html: true`, inline HTML arrives in
fragments: use `md.render()` + `sanitize` on a container instead.

### Node, SSR, workers

Named entities (`&copy;`, `&ndash;`…) are decoded through the DOM to keep the
core small. Outside the browser, import the full table:

```js
import { decodeEntity } from 'mdlib-pure/entities'
const md = createMarkdown({ decodeEntity })
```

### Styling

**Theme with semantic tokens.** Import `mdlib-pure/theme.css` and put
`class="md"` on the container. Everything is customizable through `--md-*`
tokens; neutrals follow your text color and dark mode follows `color-scheme`.
See [docs/tokens.md](docs/tokens.md).

```css
:root { --md-color-link: oklch(55% 0.2 260); --md-font-heading: "Inter", sans-serif; }
```

**Tailwind CSS v4.** The integration file loads the theme under your
utilities and exposes the tokens as theme values (`text-md-link`,
`bg-md-surface`…):

```css
@import "tailwindcss";
@import "mdlib-pure/tailwind.css";
```

Or skip the theme: default output is plain semantic HTML, so `@tailwindcss/typography` works as is:

```html
<article class="prose dark:prose-invert">…</article>
```

Or add utility classes per node type:

```js
createMarkdown({
  classes: {
    heading: 'font-semibold tracking-tight',
    heading1: 'text-3xl',
    paragraph: 'my-4 leading-7',
    link: 'text-primary underline-offset-4 hover:underline',
    inlineCode: 'rounded bg-muted px-1 font-mono text-sm',
    code: 'rounded-lg bg-muted p-4 overflow-x-auto',
  },
})
```

> Tailwind scans your sources for class names, so define the map in your own
> code (as above), not in a file under `node_modules`.

## Plugins

```js
const mark = {
  name: 'mark',
  delimiters: [{ char: '=', type: 'mark', sizes: [2] }],
  render: { mark: (node, r) => r.h('mark', null, r.children(node)) },
}

createMarkdown({ plugins: [mark] }).render('==highlighted==')
// '<p><mark>highlighted</mark></p>\n'
```

A plugin can provide:

| Field | For |
|---|---|
| `block` | new block syntax (math fences, containers, tables) |
| `inline` | syntax starting at a trigger character (`@mention`, `:emoji:`) |
| `delimiters` | symmetric runs handled like emphasis (`~~`, `==`) |
| `transform` | changes to the AST after parsing (heading ids, TOC) |
| `render` | HTML output per node type, including core nodes |

First-party plugins:

- `mdlib-pure/headings`: GitHub-style heading ids, optional `#` permalinks,
  and `toc(root)` for a table of contents. For untrusted input, use
  `headings({ prefix: 'user-content-' })` (see docs/security.md).
- `mdlib-pure/container`: fenced containers (`::: warning Title` … `:::`,
  nestable with longer fences).
- `mdlib-pure/math`: `$inline$`, `$$display$$` and `$$` blocks; bring your
  own renderer: `math({ render: (tex, display) => katex.renderToString(tex, { displayMode: display }) })`.
- `mdlib-pure/mark`: `==highlight==` → `<mark>`.
- `mdlib-pure/deflist`: definition lists (`Term` / `: Definition`, Pandoc and
  PHP Markdown Extra style) → `<dl>`.
- `mdlib-pure/frontmatter`: YAML (`---`) / TOML (`+++`) front matter, kept
  out of the output; `getFrontmatter(root)` returns the raw text.

The full guide, written for both humans and AI agents, is
[`AGENTS.md`](AGENTS.md). [`templates/plugin`](templates/plugin) is a
complete, tested plugin to copy.

## Security

- `html: false` (default): HTML in the source is not recognized and renders as text.
- Every `href`/`src` passes through `allowUrl`. The default is an allowlist:
  relative URLs, `http:`, `https:`, `mailto:`, `tel:`, `sms:`, plus
  `data:image/{png,gif,jpeg,webp}` for images only.
- `renderTo()` builds DOM with `createElement`/`createTextNode`. Only when raw
  HTML is present (you enabled `html`, or a plugin emits raw HTML) does it
  assign `innerHTML`, after `sanitize`.
- Linear-time parsing, nesting caps and output-amplification limits.

Details and threat model: [docs/security.md](docs/security.md).

## Development

```sh
npm test         # 820+ tests, TypeScript runs natively in Node ≥ 22.18
npm run test:browser  # DOM path, theme and Tailwind build in Chromium
npm run spec     # CommonMark conformance report
npm run verify   # typecheck + tests + invariants + size budgets
npm run build    # dist/
```

Live demo: `npm run build`, serve the repository root with any static
server, open `/demo/`.

## License

MIT © Michele Polo. Spec fixtures in `test/fixtures` keep their own
licenses (test data only, not published): see
[test/fixtures/README.md](test/fixtures/README.md).
