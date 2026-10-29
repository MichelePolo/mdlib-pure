# Web Components

`mdlib-pure/element` defines two custom elements that work in plain HTML and
in any framework:

- `<mdlib-markdown>`: renders Markdown from its `source` attribute;
- `<mdlib-editor>`: a Markdown editor with toolbar and live preview.

They are the base of the [Blazor wrapper](../bindings/blazor/README.md).

## Quick start

Core and every plugin are included: ~20 KB gzip. KaTeX and Mermaid are not:
pass loaders, and they are fetched only when a document uses them.

```js
import { defineElements } from 'mdlib-pure/element'

defineElements({
  loaders: {
    mermaid: () => import('mermaid'),
    katex: () => import('katex/contrib/auto-render').then((m) => m.default),
    katexStylesheet: '/css/katex.min.css',
  },
  configs: { docs: { highlight: (code, lang) => myHighlighter(code, lang) } },
})
```

```html
<link rel="stylesheet" href="mdlib-pure/theme.css" />
<link rel="stylesheet" href="mdlib-pure/editor.css" />

<mdlib-markdown class="md" source="# Hello" plugins="gfm math"></mdlib-markdown>
<mdlib-editor value="# Hello" plugins="all" style="block-size: 30rem"></mdlib-editor>
```

**Attributes**

| Element | Attribute | |
|---|---|---|
| both | `plugins` | space-separated names or `all`: `gfm headings math mermaid container deflist mark frontmatter` |
| both | `config` | name of options registered with `defineElements({ configs })` |
| `<mdlib-markdown>` | `source` | the Markdown |
| `<mdlib-editor>` | `value` | initial (or externally set) Markdown |
| `<mdlib-editor>` | `view` | `split` (default), `write`, `preview` |
| `<mdlib-editor>` | `delay` | ms before `input` is dispatched (default 200) |
| `<mdlib-editor>` | `label`, `name` | accessible name of the text area; form field name |

Options that are functions (`highlight`, `allowUrl`, `sanitize`) and `html`
can only be set through named configs, never from attributes: content cannot
switch raw HTML on.

**Editor behavior.** The preview renders on every keystroke, in the browser.
Listeners get a debounced `input` event and `change` on blur, with the text
in `event.target.value` (the text area's own events do not escape). While the
user types, an attribute set to a value the editor already sent is treated as
a late echo and ignored, so a slow server never overwrites typing; a value
set while the editor is not focused (a Reset button) is applied. The element
is form-associated: with `name`, its value is submitted with the form.
Toolbar: bold, italic, heading, link, lists, quote, code (Ctrl+B, Ctrl+I,
Ctrl+K). Math and diagrams load KaTeX and Mermaid only when a document uses
them; diagrams already drawn are reused while typing.

`getMarkdown(plugins, config)` returns the shared `Markdown` instance behind
an attribute combination (e.g. to `parse()` the editor's text).

## Without a bundler

`dist/element.js` is an ES module. Load it with an import map or a relative
path, then define the elements:

```html
<link rel="stylesheet" href="/node_modules/mdlib-pure/styles/theme.css" />
<link rel="stylesheet" href="/node_modules/mdlib-pure/styles/editor.css" />
<script type="module">
  import { defineElements } from '/node_modules/mdlib-pure/dist/element.js'
  defineElements()
</script>

<mdlib-editor name="body" value="# Draft" plugins="gfm" style="block-size: 24rem"></mdlib-editor>
```

## Reading the editor's value

```js
const editor = document.querySelector('mdlib-editor')
editor.addEventListener('input', (e) => save(e.target.value)) // debounced (delay)
editor.addEventListener('change', (e) => save(e.target.value)) // on blur
editor.value = '# Replaced' // set it from code
```

Inside a `<form>`, an editor with a `name` submits its text like a
`<textarea>` would.

## Frameworks that rewrite the page

Blazor enhanced navigation, Turbo and htmx may empty or morph elements they
did not create. Both elements repair themselves: the viewer renders again,
the editor puts back its toolbar and panes and keeps the typed text. Call
`element.refresh()` to render again by hand; every `defineElements()` call
refreshes the elements already in the page (e.g. loaders registered late).

## Frameworks

- **Blazor**: use [MdlibPure.Blazor](../bindings/blazor/README.md), which wraps
  these elements for every render mode and adds a C# AST service.
- **React 19, Vue, Svelte, Angular**: custom elements work as-is. Pass
  `source`/`value` as attributes and listen to `input`/`change` events.

## Security

Raw HTML and functions cannot be enabled from attributes: `html`,
`highlight`, `allowUrl` and `sanitize` only come from named configs written
in JavaScript. URLs follow the [default allowlist](security.md#url-policy);
Mermaid runs with `securityLevel: 'strict'`.
