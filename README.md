# mdlib-pure

Lightweight Markdown renderer for the browser.

- **100% CommonMark 0.31.2**: all 652 spec examples pass
- **Zero dependencies**, ~10 KB gzipped
- **Safe by default**: raw HTML off, `javascript:` URLs blocked, DOM output without HTML parsing
- **Extensible**: block, inline and delimiter rules, AST transforms, render overrides
- **Framework-neutral output**: HTML string, DOM nodes, or VNodes for your own `h()`
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
})
```

### Node, SSR, workers

Named entities (`&copy;`, `&ndash;`…) are decoded through the DOM to keep the
core small. Outside the browser, import the full table:

```js
import { decodeEntity } from 'mdlib-pure/entities'
const md = createMarkdown({ decodeEntity })
```

### Styling with Tailwind

Default output is plain semantic HTML, so `@tailwindcss/typography` works as is:

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

The full guide, written for both humans and AI agents, is
[`AGENTS.md`](AGENTS.md).

## Security

- `html: false` (default): HTML in the source is not recognized and renders as text.
- Every `href`/`src` passes through `allowUrl`. The default allows relative
  URLs, `http:`, `https:` and `mailto:`.
- `renderTo()` builds DOM with `createElement`/`createTextNode`. Only when raw
  HTML is present (you enabled `html`, or a plugin emits raw HTML) does it
  assign `innerHTML`, after `sanitize`.

## Development

```sh
npm test         # 690+ tests, TypeScript runs natively in Node ≥ 22.18
npm run spec     # CommonMark conformance report
npm run verify   # typecheck + tests + invariants + size budgets
```

## License

MIT © Michele Polo. CommonMark spec fixtures in `test/fixtures` are
CC-BY-SA 4.0 (test data only, not published).
