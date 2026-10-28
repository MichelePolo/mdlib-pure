# API reference

Entry points (all ES modules, all tree-shakable):

| Import | Contents |
|---|---|
| `mdlib-pure` | `createMarkdown`, rendering helpers, types |
| `mdlib-pure/entities` | `decodeEntity`: full HTML entity table (Node, SSR, workers) |
| `mdlib-pure/gfm` | `gfm()` and the single GFM extensions |
| `mdlib-pure/headings` | `headings()`, `toc()`, `slug()`, `slugger()`, `headingText()` |
| `mdlib-pure/container` | `container()` for `:::` blocks |
| `mdlib-pure/adapter` | `toElements()` for React, Preact, Vue |
| `mdlib-pure/math` | `math()` for `$…$`, `$$…$$` and `$$` blocks |
| `mdlib-pure/mark` | `mark()` for `==…==` |
| `mdlib-pure/deflist` | `deflist()` for definition lists |
| `mdlib-pure/frontmatter` | `frontmatter()`, `getFrontmatter()` |
| `mdlib-pure/theme.css` | default theme ([tokens](tokens.md)) |
| `mdlib-pure/tailwind.css` | Tailwind CSS v4 bridge |

## createMarkdown(options?)

```ts
function createMarkdown(options?: Options): Markdown
```

Builds a configured instance. Rule tables are compiled once here: create the
instance once and reuse it.

### Options

| Option | Type | Default | |
|---|---|---|---|
| `plugins` | `Plugin[]` | `[]` | see [Plugins](#plugins) |
| `html` | `boolean` | `false` | recognize raw HTML; otherwise it renders as text |
| `sanitize` | `(html: string) => string` | — | applied to `render()`/`renderTo()` output and to each raw node of `toVNodes()` |
| `allowUrl` | `(url, kind: 'link' \| 'image') => boolean` | `isSafeUrl` | rejected URLs become `""` ([policy](security.md#url-policy)) |
| `decodeEntity` | `(name: string) => string \| undefined` | DOM-based | use `decodeEntity` from `mdlib-pure/entities` outside browsers |
| `classes` | `Record<string, string>` | — | classes per node type; `heading1`…`heading6` for levels |
| `attributes` | `(node) => Props \| null` | — | extra attributes per node, merged (`class` appended) |
| `highlight` | `(code, lang, meta) => string \| VChild \| VChild[] \| null` | — | string = trusted HTML for `<code>` or a whole `<pre>`; VNodes = safe |
| `positions` | `boolean` | `false` | add `position` to block nodes |

### Markdown

| Method | Returns | |
|---|---|---|
| `parse(src)` | `Root` | Markdown → AST (plugin transforms applied) |
| `render(src \| root)` | `string` | HTML, CommonMark-exact serialization |
| `renderTo(el, src \| root)` | `void` | replaces `el`'s content; builds DOM directly unless raw HTML is present |
| `toVNodes(src \| root)` | `VChild[]` | for custom serializers and `toElements()` |

`render` and `renderTo` accept an AST, so you can parse once, inspect or
modify the tree, then render.

## AST

mdast-compatible plain objects. Every node has `type`; parents have
`children`; with `positions`, block nodes have
`position: { start: Point, end: Point }` where `Point = { line, column, offset }`
(1-based line and column; `end` is the point after the node; the end of a
block is the end of its last line). Inline nodes carry no position.

| Type | Fields | Notes |
|---|---|---|
| `root` | `children` | |
| `paragraph` | `children` | |
| `heading` | `depth: 1–6`, `children` | `id` with the headings plugin |
| `thematicBreak` | | |
| `blockquote` | `children` | |
| `list` | `ordered`, `start: number \| null`, `spread`, `children` | `spread` = loose |
| `listItem` | `spread`, `children` | `checked` with GFM task lists |
| `code` | `lang`, `meta`, `value` | `lang`/`meta` from the info string |
| `html` | `value`, `block?: true` | only with `html: true` |
| `text` | `value` | soft line breaks are `\n` inside text |
| `emphasis`, `strong` | `children` | |
| `inlineCode` | `value` | |
| `break` | | hard line break |
| `link` | `url`, `title: string \| null`, `children` | references are resolved |
| `image` | `url`, `title`, `alt` | |

GFM adds `table { align }` › `tableRow` › `tableCell`, `delete`,
`footnoteReference`, `footnoteDefinition`, `footnotes`, `taskCheckbox`,
`alert { kind }`. Plugins document their own nodes in their header comment.

## Rendering helpers

| Export | |
|---|---|
| `h(tag, props?, ...children)` | creates a VNode element; text children are plain strings |
| `raw(html, block?)` | trusted HTML VNode |
| `toHtml(vnodes)` | VNodes → HTML string |
| `toDom(vnodes, doc?)` | VNodes → `DocumentFragment` (throws on raw HTML) |
| `coreRenderers` | the default render functions, to wrap or reuse |
| `visit(node, fn)` | depth-first walk; return `false` to skip children |
| `isSafeUrl(url, kind)` | the default URL policy |
| `normalizeLabel(s)`, `normalizeUrl(s)` | CommonMark label matching and URL encoding |
| `escapeHtml(s)` | escapes `& < > "` |
| `MAX_NESTING` | container/inline nesting cap (100) |

### Recipe: source positions in the HTML (editors, scroll sync)

```js
createMarkdown({
  positions: true,
  attributes: (n) => n.position && { 'data-sourcepos': `${n.position.start.line}:${n.position.start.column}-${n.position.end.line}:${n.position.end.column - 1}` },
})
```

## Plugins

```ts
interface Plugin {
  name: string
  block?: BlockRule[]          // block syntax (lines → blocks)
  inline?: InlineRule[]        // syntax starting at trigger characters
  delimiters?: DelimiterRule[] // symmetric runs like ~~ or ==
  transform?(root, ctx): Root | void
  render?: Record<string, RenderFn>
}
```

Render functions receive `(node, r)` where `r` is a `RenderContext`:
`r.h`, `r.raw`, `r.children(node)`, `r.render(node)`, `r.parent`,
`r.url(url, kind)`. Transforms receive `ctx.parseInline(text)`,
`ctx.references`, `ctx.env`.

The complete contracts (parser state, return values, ordering, performance
rules) are in [AGENTS.md](../AGENTS.md); `src/types.ts` has them as JSDoc.

## mdlib-pure/gfm

`gfm(options?)` returns all extensions; each can be disabled:
`{ table, strikethrough, autolink, tasklist, footnotes, tagfilter, alerts }`
(all `true` by default). The functions `table()`, `strikethrough()`,
`autolink()`, `tasklist()`, `footnotes()`, `tagfilter()`, `alerts()` are also
exported.

## mdlib-pure/headings

- `headings({ prefix?: string, permalink?: boolean })`: sets `heading.id`
  (GitHub-compatible slugs). Use `prefix: 'user-content-'` for untrusted input.
- `toc(root)` → `{ depth, id, text }[]` (after parsing with the plugin).
- `slug(text)`, `slugger()` (de-duplicating), `headingText(node)`.

## mdlib-pure/container

`container()`: `::: kind Title` … `:::` blocks, nestable with longer fences.
Node `container { kind, title, children }`, rendered as
`<div class="md-container md-container-KIND">`.

## mdlib-pure/math

`math({ render? })`.

- Inline `$x^2$` (pandoc rules: no space after the opening `$`, the closing
  `$` not preceded by a space nor followed by a digit, so `$5 and $6` stays
  text). The closing `$` is the *next* unescaped one, wherever it is in the
  paragraph: in ``$6 per item, or `$` alone`` the `$` inside the code span
  closes math opened at `$6`. Escape stray dollars (`\$6`) in text with math.
- `$$…$$` inside a paragraph is display math.
- A `$$` line opens a block (like a code fence); text after it is `meta`.

Nodes: `inlineMath { value, display? }`, `math { value, meta }`. Default HTML
(pandoc style, TeX escaped):

```html
<span class="math math-inline">\(e^{i\pi}\)</span>
<span class="math math-display">\[\sum_k a_k\]</span>   <!-- $$…$$ in a paragraph -->
<div class="math math-display">\[\int_0^1 x\,dx\]</div> <!-- $$ block -->
```

The `\(…\)`/`\[…\]` delimiters are the defaults of **KaTeX auto-render**
and **MathJax**, so either works with no configuration (tested with KaTeX in
Chromium):

```js
md.renderTo(el, src)
renderMathInElement(el) // KaTeX auto-render; or MathJax.typesetPromise([el])
```

Or render at build time with `render(tex, display)`, which returns trusted
HTML (string), VNodes or `null`; its output replaces the delimited TeX:

```js
import katex from 'katex'
math({ render: (tex, display) => katex.renderToString(tex, { displayMode: display, throwOnError: false }) })
```

## Localizing generated text

Plugins write a few English strings: GFM alert titles (`Note`, `Tip`…), the
footnote back-link label (`Back to reference 1`) and the headings permalink
label (`Permalink: …`). Translate them with a render override, which takes
precedence over the plugin's renderer when the plugin comes first:

```js
const titles = { note: 'Nota', tip: 'Suggerimento', important: 'Importante', warning: 'Attenzione', caution: 'Cautela' }
createMarkdown({
  plugins: [
    ...gfm(),
    { name: 'it', render: {
      alert: (n, r) => r.h('div', { class: `markdown-alert markdown-alert-${n.kind}` },
        r.h('p', { class: 'markdown-alert-title' }, titles[n.kind]), r.children(n)),
    } },
  ],
})
```

## mdlib-pure/mark

`mark()`: `==text==` → `mark { children }` → `<mark>`. Same flanking rules as
`*`; `Title\n==` stays a setext heading.

## mdlib-pure/deflist

`deflist()`:

```
Term
: Definition (continuation lines may be lazy)
: Another definition

Term A
Term B
:   Definition with blocks

    Second paragraph, indented to the content column.
```

The paragraph right above a `: ` line becomes the terms (one per line). One
blank line between terms and `:` is allowed (Pandoc); it makes the list
loose. Nodes: `definitionList { spread }` › `definitionTerm` (inline) and
`definitionDescription { spread }` (blocks). HTML: `<dl>`, `<dt>`, `<dd>`;
tight lists render definitions without `<p>`.

## mdlib-pure/frontmatter

`frontmatter()`: YAML (`---` … `---`/`...`) or TOML (`+++` … `+++`) on the
first line of the document becomes `yaml`/`toml { value }`, first child of
`root`, not rendered. Unclosed front matter is not front matter (the document
parses as without the plugin). `getFrontmatter(root)` returns
`{ type, value } | null`; the value is raw text (no YAML parser: zero
dependencies).

## mdlib-pure/adapter

```ts
toElements(vnodes, h, preset?: 'react' | 'preact' | 'vue'): Array<Element | string>
```

Converts `md.toVNodes(src)` with the framework's own `h`/`createElement`,
applying its conventions. Top-level elements get a `key`.
