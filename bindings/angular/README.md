# ngx-mdlib-pure

Markdown **editor with live preview** and Markdown **viewer** for Angular 21
and 22: standalone components, signals, forms (`ngModel`, reactive forms),
server-side rendering with hydration. Plus a service for the AST, the table of
contents and HTML, in the browser and on the server.

```html
<mdlib-editor [(value)]="body" plugins="all" style="block-size: 30rem" />
<mdlib-markdown [source]="body()" plugins="all" />
```

Built on [mdlib-pure](https://github.com/MichelePolo/mdlib-pure): CommonMark
0.31.2 (652/652 spec examples), GitHub Flavored Markdown, math (KaTeX), Mermaid
diagrams, containers, definition lists, highlights, front matter. Safe by default.

- **The preview never waits for Angular.** Markdown is rendered in the browser
  on every keystroke; your signal or form control follows after a short typing
  pause (200 ms by default) and at once on blur.
- **The tag is the Web Component.** `<mdlib-editor>` and `<mdlib-markdown>` are
  Angular components whose host element *is* mdlib-pure's custom element: no
  `CUSTOM_ELEMENTS_SCHEMA`, typed inputs, no wrapper element.
- **A real form control**: `ControlValueAccessor` with validators, `touched`
  on blur, the disabled state, `ng-invalid`/`ng-touched` classes.
- **SSR**: works with `@angular/ssr` and hydration. The elements upgrade in
  the browser; `MarkdownService` also runs on the server.
- **KaTeX and Mermaid are yours to add**: pass `() => import('mermaid')`; they
  are downloaded only by pages whose Markdown has math or a diagram.
- **No dependencies** besides Angular and mdlib-pure (peer dependencies).

Contents: [How it works](#how-it-works) · [Install](#install) · [Setup](#setup) ·
[Editor](#mdlib-editor-markdowneditor) · [Forms](#forms) · [Viewer](#mdlib-markdown-markdownviewer) ·
[Plugins](#plugins) · [KaTeX and Mermaid](#katex-and-mermaid-loaders) ·
[Named configs](#named-configs-highlighting-url-policy) · [MarkdownService](#markdownservice) ·
[SSR and hydration](#ssr-and-hydration) · [Styling](#styling) · [Security](#security) ·
[Troubleshooting](#troubleshooting) · [Building from source](#building-from-source)

## How it works

mdlib-pure ships two Web Components (`mdlib-pure/element`): `<mdlib-markdown>`
renders Markdown into itself, `<mdlib-editor>` is a toolbar, a text area and a
live preview. They build DOM nodes directly (no HTML parsing) and are the same
elements the [Blazor wrapper](https://github.com/MichelePolo/mdlib-pure/blob/main/bindings/blazor/README.md)
uses.

This package adds Angular on top, without a second renderer:

- `provideMdlibPure()` defines the elements in the browser, with your loaders
  and named configs, before the app renders or hydrates.
- `MarkdownEditor` (selector `mdlib-editor`) and `MarkdownViewer` (selector
  `mdlib-markdown`) only set the element's attributes from their inputs and
  listen to its events. The element renders its own content.
- The editor's debounced `input` event drives `[(value)]` and the form
  control; its `change` event (blur) marks the control touched. When Angular
  writes back a value the editor already sent while the user keeps typing,
  the element recognizes the echo and ignores it: typing is never overwritten.

## Install

**Not on the npm registry yet**: neither `ngx-mdlib-pure` nor `mdlib-pure`
is published, so `npm install ngx-mdlib-pure` fails. Until the first release,
install both from local tarballs.

1. Build the tarballs from a clone of the repository (the Angular CLI 22
   needs Node `^22.22.3`, `^24.15` or `>=26`):

   ```sh
   npm ci                              # mdlib-pure's dev tools
   npm ci --prefix bindings/angular    # Angular, ng-packagr…
   npm run angular:build               # mdlib-pure dist/, then the Angular package and its demo
   npm run angular:pack                # → bindings/angular/dist/mdlib-pure-0.1.0.tgz
                                       #   bindings/angular/dist/ngx-mdlib-pure-0.1.0.tgz
   ```

   Or get the two `.tgz` files from the maintainer.

2. Copy them into your app (for example a `vendor/` folder, committed) and install both:

   ```sh
   npm install ./vendor/mdlib-pure-0.1.0.tgz ./vendor/ngx-mdlib-pure-0.1.0.tgz
   npm install katex mermaid   # optional: math and diagrams
   ```

   npm records them as `file:vendor/…tgz` in your `package.json`, so
   `npm ci` works on CI and for your colleagues. Once published:
   `npm install mdlib-pure ngx-mdlib-pure`.

| Peer dependency | Version |
|---|---|
| `@angular/core`, `@angular/common`, `@angular/forms` | `^21.0.0 \|\| ^22.0.0` |
| `mdlib-pure` | `^0.1.0` |

## Setup

**`app.config.ts`**

```ts
import { provideMdlibPure } from 'ngx-mdlib-pure'

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(),
    provideMdlibPure(), // with loaders and configs: see below
  ],
}
```

With SSR, `app.config.server.ts` merges this config as usual: nothing to add
there. On the server the provider defines no element.

**Styles**, in `src/styles.css`:

```css
@import 'mdlib-pure/theme.css';   /* Markdown typography, on every .md */
@import 'mdlib-pure/editor.css';  /* the editor's toolbar and panes */
```

**Components**: import them where you use them (standalone).

```ts
import { MarkdownEditor, MarkdownViewer } from 'ngx-mdlib-pure'

@Component({
  imports: [MarkdownEditor, MarkdownViewer],
  template: `
    <mdlib-editor [(value)]="body" plugins="all" style="block-size: 30rem" />
    <mdlib-markdown [source]="body()" plugins="all" />
  `,
})
export class ArticlePage {
  readonly body = signal('# Release notes')
}
```

## `<mdlib-editor>`: `MarkdownEditor`

A toolbar (bold, italic, heading, link, lists, quote, code; Ctrl+B / Ctrl+I /
Ctrl+K), the Markdown source and the live preview, side by side (`split`),
source only (`write`) or preview only (`preview`).

```html
<!-- Two-way binding to a signal (or a plain property) -->
<mdlib-editor [(value)]="body" plugins="all" style="block-size: 30rem" />

<!-- Save after each typing pause, and on blur -->
<mdlib-editor [value]="draft()" (valueChange)="saveDraft($event)" (valueCommit)="saveNow($event)" delay="1000" />
```

| Input | Type | Default | |
|---|---|---|---|
| `value` | `string` | `''` | The Markdown. Two-way: `[(value)]`. Updated after each typing pause, and at once on blur. |
| `plugins` | `MarkdownPlugins` | none | `'all'`, one name or a list: see [Plugins](#plugins). |
| `config` | `string` | | Name of a [named config](#named-configs-highlighting-url-policy). |
| `view` | `'split' \| 'write' \| 'preview'` | `'split'` | Panes shown at first; the toolbar's buttons switch them in the browser. |
| `delay` | `number` | `200` | Milliseconds of typing pause before `valueChange`. |
| `label` | `string` | `'Markdown'` | Accessible name of the text area. |
| `name` | `string` | | Form field name for native form posts (the element is form-associated). |
| `disabled` | `boolean` | `false` | Disables the editor. With forms, use the control's `disable()` instead. |

| Output | Payload | |
|---|---|---|
| `valueChange` | `string` | After each typing pause (and on blur, if a change is pending). Part of `[(value)]`. |
| `valueCommit` | `string` | On blur, with the text at that moment. |

| Member | |
|---|---|
| `element` | The `<mdlib-editor>` element (`.value` is the current text). |
| `focus(options?)` | Focus the text area. |
| `refresh()` | Render the preview again. |

Give the editor a height (`style="block-size: 30rem"` or a CSS rule): the panes
fill it and scroll. Any other attribute (`id`, `class`, `aria-*`, `data-*`) goes
on the element as usual.

## Forms

The editor is a `ControlValueAccessor`: use it like an `<input>`.

```ts
@Component({
  imports: [MarkdownEditor, ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()">
      <mdlib-editor formControlName="body" [plugins]="['gfm']" label="Description" />
      @if (form.controls.body.touched && form.controls.body.hasError('required')) {
        <p class="error">A description is required.</p>
      }
      <button [disabled]="form.invalid">Save</button>
    </form>
  `,
})
export class EditArticle {
  readonly form = new FormGroup({ body: new FormControl('', { nonNullable: true, validators: Validators.required }) })
}
```

```html
<!-- Template-driven -->
<mdlib-editor [(ngModel)]="notes" name="notes" required />
```

- **Value**: the control gets the text after each typing pause and on blur;
  `setValue()`, `reset()` and `patchValue()` reach the editor. `updateOn: 'blur'` works.
- **Touched** on blur. Angular's `ng-valid`/`ng-invalid`, `ng-dirty`,
  `ng-touched` classes are on the `<mdlib-editor>` element:
  `mdlib-editor.ng-invalid.ng-touched { border-color: crimson; }`.
- **Disabled** (`control.disable()`, `[disabled]` with `ngModel`): the element
  gets `disabled` and behaves like a disabled `<textarea>`: no typing, the
  formatting buttons are disabled (the view buttons still work), its value is
  left out of native form data, and it matches `:disabled`. An enclosing
  `<fieldset disabled>` does the same. `editor.css` dims it; restyle it with
  `mdlib-editor:disabled { … }`.
- **Native forms**: with `name`, the text is submitted with a plain `<form>`
  like a `<textarea>` (the element is form-associated). `ngModel`'s `name`
  sets it too.

## `<mdlib-markdown>`: `MarkdownViewer`

A read-only viewer. The element always has the class `md`, the one the theme styles.

```html
<mdlib-markdown [source]="article.body" [plugins]="['gfm', 'math']" class="article" />
```

| Input | Type | |
|---|---|---|
| `source` | `string` | The Markdown. |
| `plugins` | `MarkdownPlugins` | See [Plugins](#plugins). Default: plain CommonMark. |
| `config` | `string` | Name of a [named config](#named-configs-highlighting-url-policy). |

Members: `element` (the `<mdlib-markdown>` element), `refresh()`.

## Plugins

`plugins` (inputs) and the `plugins` argument of `MarkdownService` take
`'all'`, one name, or a list of names (`MarkdownPlugins`). Nothing (the
default), `null` or `[]` is plain CommonMark. Typos are compile errors:
`plugins="gfm"` and `[plugins]="['gfm', 'math']"` type-check, `plugins="gmf"` does not.

| Name | Syntax |
|---|---|
| `gfm` | GitHub Flavored Markdown: tables, `~~strikethrough~~`, autolinks (`www.example.com`), task lists (`- [x]`), footnotes (`[^1]`), alerts (`> [!NOTE]`) |
| `headings` | GitHub-style heading ids (`## Next steps` → `id="next-steps"`), for anchors and the TOC |
| `math` | `$inline$`, `$$display$$`, typeset by KaTeX ([loader](#katex-and-mermaid-loaders)) |
| `mermaid` | ` ```mermaid ` code blocks, drawn by Mermaid ([loader](#katex-and-mermaid-loaders)), colored from the theme (light and dark) |
| `container` | `::: warning Title` … `:::` (note, tip, important, warning, caution, or any word) |
| `deflist` | `Term` then `: Definition` |
| `mark` | `==highlight==` |
| `frontmatter` | YAML (`---`) or TOML (`+++`) at the top, kept out of the output |
| `'all'` | all of the above |

`MARKDOWN_PLUGINS` lists the names.

## KaTeX and Mermaid (loaders)

Neither is a dependency of this package. Install them in your app and pass
loaders: the bundler splits them into lazy chunks, and the elements call a
loader only when a document has math or a diagram.

```ts
provideMdlibPure({
  loaders: {
    mermaid: () => import('mermaid'),
    katex: () => import('katex/contrib/auto-render').then((m) => m.default),
    katexStylesheet: '/katex/katex.min.css',
  },
})
```

The KaTeX stylesheet and its fonts must be served by your app: copy them with
`angular.json` → `build.options.assets`:

```json
{ "glob": "{katex.min.css,fonts/*.woff2}", "input": "node_modules/katex/dist", "output": "katex" }
```

- The `katex` loader wraps `renderMathInElement` because KaTeX types its
  first parameter as `HTMLElement`; the elements always pass an `HTMLElement`.
- The stylesheet is added once, when math first appears (as an adopted
  stylesheet: frameworks that morph the page cannot remove it).
- Mermaid is large (the demo's lazy chunks total several MB, split per diagram
  type) but only pages with a diagram download it. Its CommonJS dependencies
  print build warnings; silence them with `"allowedCommonJsDependencies":
  ["@braintree/sanitize-url", "cytoscape-cose-bilkent", "cytoscape-fcose", "dayjs", "elkjs"]`.
- With SSR, the loaders also end up in the server bundle (the config is
  shared) but never run there.

## Named configs (highlighting, URL policy)

mdlib-pure options that are functions (`highlight`, `allowUrl`, `attributes`,
`sanitize`) or that change what is safe (`html`) can only be set in
TypeScript, under a name, never from a template:

```ts
provideMdlibPure({
  configs: {
    docs: {
      // External links open in a new tab.
      attributes: (node) => (node.type === 'link' && /^https?:/i.test(node['url'] as string) ? { target: '_blank', rel: 'noopener noreferrer' } : null),
      // Only links to our own domains (default: relative, http(s), mailto, tel, sms).
      allowUrl: (url) => url.startsWith('/') || /^https:\/\/([a-z0-9-]+\.)*example\.com\//i.test(url),
      // Classes per node type (Tailwind…), syntax highlighting:
      classes: { heading: 'font-semibold' },
      highlight: (code, lang) => (lang && hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : null),
    },
  },
})
```

```html
<mdlib-editor [(value)]="body" config="docs" />
<mdlib-markdown [source]="body()" config="docs" />
```

`MarkdownService` uses the same configs (`service.render(text, 'all', 'docs')`).
Options reference: mdlib-pure's [`docs/api.md`](https://github.com/MichelePolo/mdlib-pure/blob/main/docs/api.md).

## `MarkdownService`

mdlib-pure from TypeScript, synchronous, in the browser and on the server.

```ts
@Injectable({ providedIn: 'root' })
class MarkdownService {
  parse(source: string, plugins?: MarkdownPlugins | null, config?: string | null): Root
  toc(source: string, plugins?: MarkdownPlugins | null, config?: string | null): TocEntry[] // [{ depth, id, text }]
  render(source: string, plugins?: MarkdownPlugins | null, config?: string | null): string
  instance(plugins?: MarkdownPlugins | null, config?: string | null): Markdown // the elements' shared instance
}
```

```ts
readonly #markdown = inject(MarkdownService)
readonly body = signal('# Title')

// A table of contents that follows the editor, rendered on the server too.
readonly outline = computed(() => this.#markdown.toc(this.body(), 'all'))

// The AST (mdast style): links, images, open tasks…
links() {
  const out: string[] = []
  visit(this.#markdown.parse(this.body(), 'gfm'), (n) => { if (n.type === 'link') out.push(n['url'] as string) })
  return out
}
```

(`visit` is exported by `mdlib-pure`.)

- `toc()` always enables `headings`, so its ids match a viewer with the
  `headings` plugin (`<a [href]="'#' + h.id">`).
- `render()` returns the viewer's HTML before KaTeX and Mermaid run (math
  stays `\(…\)`, diagrams `<pre class="mermaid">`).
- **On the server** the provider registers your configs with mdlib-pure's full
  HTML entity table (`mdlib-pure/entities`, loaded only by the server bundle),
  so `&copy;` or `&ndash;` decode as in the browser. Add `provideMdlibPure()`
  to the app config: without it the server only knows `&amp; &lt; &gt; &quot; &apos; &nbsp;`.
- Node types and properties: mdlib-pure's `docs/api.md` and each plugin's source header.

## SSR and hydration

| | Server | Browser |
|---|---|---|
| `<mdlib-editor>`, `<mdlib-markdown>` | rendered **empty**, with their attributes | defined by `provideMdlibPure()`, they render themselves |
| `[(value)]`, forms, outputs | initial value in the `value` attribute | live |
| `MarkdownService` | ✓ (entities included) | ✓ |
| KaTeX, Mermaid | not loaded | loaded on demand |

- **Nothing is rendered on the server** inside the elements: the Markdown text
  is not in the server HTML (no SEO for it), by design, like the Blazor
  wrapper. The rest of the page (and anything you compute with
  `MarkdownService`, like an outline) is.
- **Hydration**: the components carry `ngSkipHydration`, Angular's opt-out
  for DOM it does not own. Angular keeps the element, empties it, and the
  element puts its content back at once (the editor keeps its text and
  toolbar). Everything else on the page is hydrated normally; there are no
  hydration mismatch errors. Tested end to end with Angular 22's default
  `provideClientHydration()` (event replay and incremental hydration on).
- **Client-side navigation**: components created in the browser behave the same.
- **Zoneless**: the components use signals and are `OnPush`; nothing depends
  on zone.js (the demo is zoneless, the default of new Angular apps).

## Styling

`mdlib-pure/theme.css` styles every `.md` container (the viewer, the editor's
preview); `mdlib-pure/editor.css` the editor (`.mdlib-editor-toolbar`,
`.mdlib-editor-input`, `.mdlib-editor-preview`). All their rules are in
`@layer mdlib` with zero specificity: any rule of yours wins.

- **Customize** with the `--md-*` tokens ([docs/tokens.md](https://github.com/MichelePolo/mdlib-pure/blob/main/docs/tokens.md)):

  ```css
  :root { --md-color-link: #0f6cbd; --md-font-heading: "Segoe UI", sans-serif; }
  ```

- **Dark mode** follows `color-scheme`: `<meta name="color-scheme" content="light dark">`
  in `index.html`, or `:root { color-scheme: light dark; }`.
- **Tailwind CSS v4**: `@import "tailwindcss"; @import "mdlib-pure/tailwind.css";`
  then `@import 'mdlib-pure/editor.css';`.
- Put these imports in a global stylesheet (`styles.css`), not in a
  component's `styles`: Angular's view encapsulation would scope them away
  from the elements' content.

## Security

- **Raw HTML is off**: `<script>`, `<iframe>`, `onerror=`… in the Markdown are
  shown as text. It cannot be turned on from a template; only a
  [named config](#named-configs-highlighting-url-policy) (`html: true`,
  ideally with `sanitize`) can, for trusted content.
- **URL allowlist**: every `href`/`src` goes through it. Allowed: relative
  URLs, `http:`, `https:`, `mailto:`, `tel:`, `sms:`, and `data:image/png|gif|jpeg|webp`
  for images. `javascript:` and other schemes lose their URL.
- **No HTML parsing**: the elements build DOM nodes directly; the components
  only set attributes. No `innerHTML`, no `bypassSecurityTrust…`.
- **`MarkdownService.render()`** output is safe with the default options. If
  you bind it with `[innerHTML]`, Angular's sanitizer runs too (and may strip
  attributes it does not know); prefer `<mdlib-markdown>`. Never trust HTML
  from a config with `html: true` and no `sanitize`.
- **Mermaid** runs with `securityLevel: 'strict'` (no HTML labels, no click
  handlers). **KaTeX** runs with its defaults (`trust: false`: no `\href`, no
  `\includegraphics`).
- **Heading ids** (`headings` plugin) come from the content: a document can
  create an element with `id="config"`, which browsers expose as
  `window.config` ("DOM clobbering"). With untrusted authors, do not rely on
  global variables named like possible headings, or leave `headings` off.
- **Content-Security-Policy**: everything is served from your origin (no CDN,
  no `eval`). The KaTeX stylesheet is fetched (`connect-src 'self'`); Mermaid
  inserts `<style>` elements into its SVGs, which a `style-src` without
  `'unsafe-inline'` blocks. Not tested under a strict policy.

More: mdlib-pure's [`docs/security.md`](https://github.com/MichelePolo/mdlib-pure/blob/main/docs/security.md).

## Troubleshooting

| Symptom | Cause |
|---|---|
| The elements stay empty | `provideMdlibPure()` is missing from the app config (nothing defines the elements). |
| Build warnings `Ignoring this import because "…/chunk-….js" was marked as having no side effects` | mdlib-pure 0.1.0's build: harmless (those chunks only declare functions). |
| Build warnings `Module 'dayjs' used by '…mermaid…' is not ESM` | Mermaid's CommonJS dependencies: see `allowedCommonJsDependencies` [above](#katex-and-mermaid-loaders). |
| `TS2322` on the `katex` loader | Wrap `renderMathInElement` as shown [above](#katex-and-mermaid-loaders). |
| `TS2322` on `plugins="gfm math"` | Use a list: `[plugins]="['gfm', 'math']"`. |
| Math shows as `\(x^2\)`, diagrams as source | No `katex`/`mermaid` loader, or the `math`/`mermaid` plugin is not enabled. |
| Math has no fonts | `katexStylesheet` URL not served: check the `assets` entry. |
| `&ndash;` stays literal in server-rendered `MarkdownService` output | `provideMdlibPure()` missing from the config the server uses. |
| Text typed in the editor reverts | Some code sets the value to an older one while the editor is *not* focused (after a button click): the element applies values that are not echoes of its own. |
| `The Angular CLI requires a minimum Node.js version` | Angular CLI 22 needs Node `^22.22.3`, `^24.15` or `>=26` (mdlib-pure itself needs ≥ 22.18). |

## Building from source

This folder lives in the mdlib-pure repository (`bindings/angular/`), an
Angular CLI workspace with its own `package.json`:

```text
bindings/angular/
  projects/ngx-mdlib-pure/   the library (ng-packagr): src/lib/*.ts and *.spec.ts
  demo/                      SSR demo app (zoneless): editor, viewer, service, forms
  scripts/package-files.mjs  copies this README and the LICENSE into the package
  scripts/fresh-deps.mjs     drops Vite's dependency caches before `ng test` and `ng serve`
  dist/                      build output (gitignored): ngx-mdlib-pure/, demo/, *.tgz
```

From the repository root:

```sh
npm ci && npm ci --prefix bindings/angular
npm run angular:build   # mdlib-pure dist/ (the workspace links it: "mdlib-pure": "file:../.."), library, demo
npm run angular:unit    # Vitest in Chromium, through Angular's unit-test builder
npm run test:angular    # end to end in Chromium: builds, serves the SSR demo, drives it
npm run angular:pack    # the two tarballs, in bindings/angular/dist/
```

Inside `bindings/angular`: `npm start` serves the demo with live reload
(<http://localhost:4200>); `npm run serve:ssr:demo` runs the production
server after `npm run build` (<http://localhost:4000>, `PORT` to change it).
Unit tests need Playwright's Chromium once: `npx playwright install chromium`.
Both `npm test` and `npm start` first drop Vite's dependency caches
(`scripts/fresh-deps.mjs`): Vite would otherwise keep serving the mdlib-pure
it pre-bundled before your last rebuild, since the link does not change the
lockfile.

## License

MIT © Michele Polo.
