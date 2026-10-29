# MdlibPure.Blazor

Markdown **editor with live preview** and Markdown **viewer** for Blazor (.NET 10),
in every render mode: Static SSR, Interactive Server, Interactive WebAssembly
and Interactive Auto. Plus a C# service for the AST, the table of contents and HTML.

```razor
<MarkdownEditor @bind-Value="Body" Plugins="MarkdownPlugins.All" Style="block-size: 30rem" />
<Markdown Value="@Body" Plugins="MarkdownPlugins.All" />
```

Built on [mdlib-pure](https://github.com/MichelePolo/mdlib-pure): CommonMark
0.31.2 (652/652 spec examples), GitHub Flavored Markdown, math (KaTeX), Mermaid
diagrams, containers, definition lists, highlights, front matter. Safe by default.

- **The preview never waits for the server.** Markdown is rendered in the
  browser on every keystroke; the C# value follows after a short typing pause
  (200 ms by default). Under Interactive Server, typing is never slowed down or
  overwritten by round trips.
- **Same components in every render mode**, Static SSR included: there the
  editor still works in the browser and posts its value with your form.
- **No setup in the page**: no `<script>`, no `<link>`. Blazor loads the
  package's JavaScript initializer, which also adds the stylesheets.
- **KaTeX and Mermaid included** in the package, loaded only by pages that
  contain math or diagrams.
- **Nothing is rendered on the server**: no SEO prerendering of Markdown, by design.

Contents: [Install](#install) · [Setup](#setup) · [Editor](#markdowneditor) ·
[Viewer](#markdown) · [Plugins](#plugins) · [Render modes](#render-modes) ·
[AST service](#ast-service-imarkdownservice) · [Named configs](#named-configs-highlighting-url-policy) ·
[Styling](#styling) · [Security](#security) · [Troubleshooting](#troubleshooting) ·
[Building from source](#building-from-source)

## How it works

The package wraps two Web Components of mdlib-pure, `<mdlib-markdown>` and
`<mdlib-editor>`. The Razor components render the element *empty* and only
ever set its attributes (`source`, `value`, `plugins`…); the element renders
the Markdown into itself, in the browser, with DOM APIs (no HTML parsing). The
browser upgrades custom elements wherever they appear: in static HTML, after
an enhanced navigation, in an interactive render. That is why one mechanism
works in all four render modes.

`@bind-Value` listens to the element's own `input` event, which the element
sends after a typing pause (`Delay`) with the whole text in
`event.target.value`. When Blazor sends the value back as the `value`
attribute while the user keeps typing, the element recognizes it as an echo
and ignores it.

## Install

Until the package is published on nuget.org, use a local package feed.

1. Get `MdlibPure.Blazor.0.1.0.nupkg` (from the maintainer, or build it, see
   [Building from source](#building-from-source)) and put it in a folder, for
   example `packages/` next to your solution.
2. Add a `nuget.config` next to your solution:

   ```xml
   <?xml version="1.0" encoding="utf-8"?>
   <configuration>
     <packageSources>
       <add key="local" value="packages" />
     </packageSources>
   </configuration>
   ```

3. Reference the package from the project that contains your components:

   ```sh
   dotnet add package MdlibPure.Blazor --version 0.1.0
   ```

   | App | Reference it from |
   |---|---|
   | Blazor Web App, Static SSR / Interactive Server only | the server project |
   | Blazor Web App with WebAssembly or Auto | the `.Client` project (the server project gets it through its reference to `.Client`) |
   | Standalone Blazor WebAssembly | the app project |

The package depends only on `Microsoft.AspNetCore.Components.Web`.

## Setup

**`_Imports.razor`**

```razor
@using MdlibPure.Blazor
```

That is enough for the components. For the [AST service](#ast-service-imarkdownservice),
register it in `Program.cs`, in the server project and, with WebAssembly or
Auto, in the `.Client` project too:

```csharp
builder.Services.AddMdlibPure();
```

**Interactive Server**: the editor sends the whole document in each `input`
event, and SignalR refuses incoming messages over 32 KB by default (the
circuit disconnects). Raise the limit for documents of more than a few pages:

```csharp
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    .AddHubOptions(o => o.MaximumReceiveMessageSize = 1024 * 1024); // 1 MB
```

Nothing to add to `App.razor`: Blazor loads
`_content/MdlibPure.Blazor/MdlibPure.Blazor.lib.module.js` by itself (the
"JS initializer" mechanism of Razor class libraries). It implements the hooks
of Blazor Web Apps (`beforeWebStart`/`afterWebStarted`, tested end to end) and
the classic ones of standalone WebAssembly apps and `_Host.cshtml` Blazor
Server apps (`beforeStart`/`afterStarted`, not covered by the tests).

## `<MarkdownEditor>`

A toolbar (bold, italic, heading, link, lists, quote, code; Ctrl+B / Ctrl+I /
Ctrl+K), the Markdown source and the live preview, side by side ("split"),
source only ("write") or preview only ("preview"). It derives from
`InputBase<string?>`, like `InputText`.

```razor
@* Interactive (Server, WebAssembly, Auto) *@
<MarkdownEditor @bind-Value="Body" Plugins="MarkdownPlugins.All" Style="block-size: 30rem" />

@code {
    private string Body { get; set; } = "# Release notes";
}
```

Save while the user writes, after each typing pause:

```razor
<MarkdownEditor @bind-Value="Body" @bind-Value:after="SaveDraftAsync" Delay="1000" />
```

In an `EditForm`, with validation (the editor gets the usual `modified`,
`valid`/`invalid` classes and `aria-invalid`):

```razor
<EditForm Model="Article" OnValidSubmit="SaveAsync">
    <DataAnnotationsValidator />
    <MarkdownEditor @bind-Value="Article.Body" Plugins="MarkdownPlugins.Gfm" Label="Article body" />
    <ValidationMessage For="() => Article.Body" />
    <button type="submit">Save</button>
</EditForm>
```

| Parameter | Type | Default | |
|---|---|---|---|
| `Value` / `ValueChanged` / `ValueExpression` | `string?` | | Use `@bind-Value`. `Value` alone also works (no `ValueExpression` needed, unlike `InputText`). |
| `Plugins` | `MarkdownPlugins` | `None` | Preview syntax: see [Plugins](#plugins). |
| `Config` | `string?` | | Name of a [named config](#named-configs-highlighting-url-policy). |
| `View` | `MarkdownEditorView` | `Split` | `Split`, `Write` or `Preview`. The toolbar's buttons switch it in the browser. |
| `Delay` | `int?` | 200 | Milliseconds of typing pause before `ValueChanged`. On blur the value is sent at once. |
| `Label` | `string?` | "Markdown" | Accessible name of the text area. |
| `Name` | `string?` | | Form field name. Inside an `EditForm` it defaults to the bound expression (`Article.Body`), like `InputText`. |
| `Class`, `Style` | `string?` | | On the element. Give the editor a height (`block-size: 30rem`): the panes fill it and scroll. |
| `InertUntilInteractive` | `bool` | `true` | See [Prerendering](#prerendering). |
| any other attribute | | | Passed to the element (`id`, `aria-*`, `data-*`…). |

`Element` (`ElementReference?`) is the `<mdlib-editor>` element, for your own JS interop.

### Static SSR forms

Without interactivity no event reaches .NET, but the element is a
form-associated custom element: its value is submitted with the form under
`Name`. With `[SupplyParameterFromForm]` and an `EditForm`, the name is
generated for you:

```razor
@page "/articles/edit"

<EditForm Model="Input" FormName="article" OnValidSubmit="Save" Enhance>
    <MarkdownEditor @bind-Value="Input!.Body" Plugins="MarkdownPlugins.All" />
    <button type="submit">Save</button>
</EditForm>

@code {
    [SupplyParameterFromForm(FormName = "article")]
    private ArticleInput? Input { get; set; }

    protected override void OnInitialized() => Input ??= new() { Body = "# Draft" };

    private void Save() { /* Input.Body holds the posted Markdown */ }

    public sealed class ArticleInput { public string Body { get; set; } = ""; }
}
```

Enhanced (`Enhance`) and full-page form posts both work. In a plain `<form>`
use `<MarkdownEditor Value="@Body" Name="body" />`. Note: like a `<textarea>`,
a full-page (non-enhanced) post sends line breaks as CRLF.

## `<Markdown>`

A read-only viewer.

```razor
<Markdown Value="@Article.Body" Plugins="MarkdownPlugins.Gfm | MarkdownPlugins.Math" class="article" />
```

| Parameter | Type | Default | |
|---|---|---|---|
| `Value` | `string?` | | The Markdown. |
| `Plugins` | `MarkdownPlugins` | `None` | See [Plugins](#plugins). |
| `Config` | `string?` | | Name of a [named config](#named-configs-highlighting-url-policy). |
| `Class` | `string?` | | Extra classes; the element always has `md`, the class the theme styles. |
| any other attribute | | | Passed to the element. |

## Plugins

`MarkdownPlugins` is a `[Flags]` enum: combine values with `|`, or use `All`.
`None` (the default) is plain CommonMark.

| Flag | Syntax |
|---|---|
| `Gfm` | GitHub Flavored Markdown: tables, `~~strikethrough~~`, autolinks (`www.example.com`), task lists (`- [x]`), footnotes (`[^1]`), alerts (`> [!NOTE]`) |
| `Headings` | GitHub-style heading ids (`## Next steps` → `id="next-steps"`), for anchors and the TOC |
| `Math` | `$inline$`, `$$display$$`, typeset by KaTeX |
| `Mermaid` | ` ```mermaid ` code blocks, drawn by Mermaid, colored from the theme (light and dark) |
| `Container` | `::: warning Title` … `:::` (note, tip, important, warning, caution, or any word) |
| `DefinitionList` | `Term` then `: Definition` |
| `Mark` | `==highlight==` |
| `FrontMatter` | YAML (`---`) or TOML (`+++`) at the top, kept out of the output |
| `All` | all of the above |

KaTeX (~540 KB) and Mermaid (~5 MB, split in chunks per diagram type) ship
inside the package and are downloaded only by pages whose Markdown contains
math or a diagram.

## Render modes

| | Static SSR | Interactive Server | Interactive WebAssembly | Interactive Auto |
|---|---|---|---|---|
| `<Markdown>` viewer | ✓ | ✓ | ✓ | ✓ |
| Editor preview while typing | ✓ live, in the browser | ✓ live | ✓ live | ✓ live |
| C# `Value` updated | on form submit (`Name`) | after the typing pause, over the circuit | after the typing pause, in the browser | as Server, then WebAssembly |
| `@bind-Value`, `EditForm` validation | form post + server validation | ✓ | ✓ | ✓ |
| `IMarkdownService` | ✗ throws `InvalidOperationException` | ✓ | ✓ | ✓ |
| Enhanced navigation / enhanced forms | ✓ | ✓ | ✓ | ✓ |

All of the above is covered by end-to-end tests in Chromium
(`test/blazor/e2e.blazor.ts` in the repository).

**Enhanced navigation.** Blazor patches the page in place after an enhanced
navigation or form post, which would delete what the elements rendered into
themselves. The components mark the elements `data-permanent` (Blazor's
documented opt-out): their content is kept, their attributes are still
updated, so a new `Value` re-renders.

### Prerendering

Interactive components are prerendered by default: the page shows the editor
before it is interactive, and Blazor *replaces* that markup when the
component becomes interactive (after the circuit connects, or after the
WebAssembly download). Anything typed in between would be lost, so while
prerendered the editor is `inert`: visible, rendered, but not focusable. Set
`InertUntilInteractive="false"` to turn that off, or disable prerendering on
the page (`@rendermode @(new InteractiveWebAssemblyRenderMode(prerender: false))`).

## AST service: `IMarkdownService`

```csharp
public interface IMarkdownService
{
    Task<MarkdownNode> ParseAsync(string markdown, MarkdownPlugins plugins = None, string? config = null, CancellationToken ct = default);
    Task<IReadOnlyList<TocEntry>> GetTocAsync(string markdown, MarkdownPlugins plugins = None, string? config = null, CancellationToken ct = default);
    Task<string> RenderHtmlAsync(string markdown, MarkdownPlugins plugins = None, string? config = null, CancellationToken ct = default);
}
```

The work is done by mdlib-pure **in the browser**, through JavaScript interop:
the service needs an interactive render mode, and must be called once the
component is interactive (an event handler, or `OnAfterRenderAsync`). In
Static SSR or during prerendering it throws an `InvalidOperationException`
that says so. Results travel as a stream, so large documents are fine under
Interactive Server too (limit: `AddMdlibPure(o => o.MaxResultSize = …)`,
16 MB by default).

```razor
@inject IMarkdownService MarkdownService

<button @onclick="BuildTocAsync">Table of contents</button>
<ol>
    @foreach (var h in _toc)
    {
        <li style="margin-inline-start: @(h.Depth - 1)em"><a href="#@h.Id">@h.Text</a></li>
    }
</ol>

@code {
    private IReadOnlyList<TocEntry> _toc = [];

    private async Task BuildTocAsync() =>
        _toc = await MarkdownService.GetTocAsync(Body, MarkdownPlugins.Gfm);
}
```

`GetTocAsync` always enables the `Headings` plugin, so the ids match a
`<Markdown>` viewer that has `MarkdownPlugins.Headings`.

`MarkdownNode` is an mdast-style tree:

```csharp
var root = await MarkdownService.ParseAsync(Body, MarkdownPlugins.All);

var links = root.Descendants()
    .Where(n => n.Type == "link")
    .Select(n => (Url: n.GetString("url"), Text: n.TextContent()));

var images = root.Descendants().Count(n => n.Type == "image");
var openTasks = root.Descendants().Count(n => n.Type == "listItem" && n.GetBoolean("checked") == false);
var level2 = root.Descendants().Where(n => n.Type == "heading" && n.GetInt32("depth") == 2);
```

| Member | |
|---|---|
| `Type` | `root`, `paragraph`, `heading`, `text`, `emphasis`, `strong`, `link`, `image`, `code`, `inlineCode`, `list`, `listItem`, `blockquote`, `table`, `math`, `inlineMath`, `mermaid`, `container`, `footnoteDefinition`… |
| `Value` | literal content of leaves (`text`, `code`, `inlineCode`, `math`…), else `null` |
| `Children` | child nodes, else `null` |
| `Properties` | every other property as `JsonElement` (`depth`, `url`, `title`, `lang`, `ordered`, `checked`, `id`…) |
| `GetString`, `GetInt32`, `GetBoolean`, `TryGetProperty` | typed access to `Properties` |
| `Descendants()`, `DescendantsAndSelf()` | depth-first, document order (not recursive: deep documents are fine) |
| `TextContent()` | the text a reader sees |

Soft line breaks are `\n` inside `text` values. Node types and properties are
described in mdlib-pure's `docs/api.md` and in each plugin's source header.

`RenderHtmlAsync` returns the same HTML as the viewer, before KaTeX and
Mermaid run (math stays as `\(…\)`, diagrams as `<pre class="mermaid">`).

## Named configs (highlighting, URL policy)

Some mdlib-pure options are JavaScript functions: syntax highlighting
(`highlight`), the URL policy (`allowUrl`), extra attributes per node
(`attributes`), CSS classes per node type (`classes`). They are registered in
JavaScript under a name and selected with `Config="name"` (components) or the
`config` argument (service). Put them in your app's own JS initializer,
`wwwroot/<YourAssemblyName>.lib.module.js` (in a Blazor Web App, the server
project's `wwwroot`); Blazor loads it by itself:

```js
// wwwroot/MyApp.lib.module.js
export async function beforeWebStart() {
  const { defineElements } = await import('./_content/MdlibPure.Blazor/dist/mdlib-element.js')
  defineElements({
    configs: {
      docs: {
        // External links open in a new tab.
        attributes: (node) => (node.type === 'link' && /^https?:/i.test(node.url) ? { target: '_blank', rel: 'noopener noreferrer' } : null),
        // Only links to our own domains (default: relative, http(s), mailto, tel, sms).
        allowUrl: (url, kind) => url.startsWith('/') || /^https:\/\/([a-z0-9-]+\.)*example\.com\//i.test(url),
      },
    },
  })
}
// Standalone WebAssembly / Blazor Server apps: name the function beforeStart instead.
```

```razor
<MarkdownEditor @bind-Value="Body" Config="docs" />
```

The demo app does exactly this (`samples/…/wwwroot/MdlibPure.Blazor.Demo.lib.module.js`).
Options reference: mdlib-pure's `docs/api.md`. The `html` option can only be
enabled here too, never from Razor attributes; see [Security](#security).

## Styling

The JS initializer adds mdlib-pure's `theme.css` (the Markdown typography) and
`editor.css` (toolbar and panes) as adopted stylesheets, unless the page
already has them. The viewer and the preview have the class `md`.

- **Customize** with the `--md-*` tokens in your own CSS (see mdlib-pure's
  `docs/tokens.md`):

  ```css
  :root { --md-color-link: #0f6cbd; --md-font-heading: "Segoe UI", sans-serif; }
  ```

- **Dark mode** follows `color-scheme`: add `<meta name="color-scheme" content="light dark">`
  or `:root { color-scheme: light dark; }`. Neutral colors derive from the text color.
- **Your own copy** (bundled, Tailwind via mdlib-pure's `tailwind.css`…): the
  initializer detects it and adds nothing. Or link the package's files yourself:
  `_content/MdlibPure.Blazor/dist/theme.css` and `…/dist/editor.css`.
- **No stylesheets at all**: `<meta name="mdlib-pure-styles" content="none">`
  in `App.razor`'s `<head>`.

All rules are in `@layer mdlib` with zero specificity: any rule of yours wins.

## Security

- **Raw HTML is off**: `<script>`, `<iframe>`, `onerror=`… in the Markdown are
  shown as text, never interpreted. It cannot be turned on from Razor; only a
  [named config](#named-configs-highlighting-url-policy) (`html: true`,
  ideally with `sanitize`) can, for trusted content.
- **URL allowlist**: every `href`/`src` goes through it. Allowed: relative
  URLs, `http:`, `https:`, `mailto:`, `tel:`, `sms:`, and `data:image/png|gif|jpeg|webp`
  for images. `javascript:` and other schemes lose their URL.
- **No HTML parsing**: the elements build DOM nodes directly.
- **Mermaid** runs with `securityLevel: 'strict'` (no HTML labels, no click
  handlers). **KaTeX** runs with its defaults (`trust: false`: no `\href`
  links, no `\includegraphics`).
- **Heading ids** (`Headings` plugin) come from the content: a document can
  create an element with `id="config"`, which browsers expose as
  `window.config` ("DOM clobbering"). With untrusted authors, do not rely on
  global variables named like possible headings, or leave `Headings` off.
- **Interactive Server: `IMarkdownService` results come from the browser.**
  Treat them like any client input. Never store `RenderHtmlAsync` output to
  serve it to other users: store the Markdown, and render it on display with
  `<Markdown>` (each reader's browser renders it safely).
- **Content-Security-Policy**: everything is served from your origin (no
  CDN, no `eval`). Not tested under a strict policy: Mermaid inserts `<style>`
  elements into its SVGs, which a `style-src` without `'unsafe-inline'` blocks.

More: mdlib-pure's `docs/security.md`.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Build error `MDLIB001`: the browser assets are missing | Building from the repository without the generated assets: run `npm ci` and `npm run blazor:assets` at the repository root. |
| Elements stay empty, 404 for `_content/MdlibPure.Blazor/…` | The package is not referenced by the project that serves static assets (WebAssembly: reference it from `.Client`), or `app.MapStaticAssets()` is missing. |
| Interactive Server disconnects with long documents | Raise `MaximumReceiveMessageSize` (see [Setup](#setup)). |
| `InvalidOperationException: IMarkdownService needs JavaScript interop…` | Called in Static SSR or during prerendering: call it from an event handler or `OnAfterRenderAsync` of an interactive component. |
| The editor cannot be focused for a moment after the page loads | It is `inert` until the component is interactive: see [Prerendering](#prerendering). |
| Text typed in the editor reverts | Some code sets `Value` to an older value while the user is not typing in the editor (for example after a button click): the element applies values that are not echoes of its own. |

## Building from source

This folder lives in the mdlib-pure repository (`bindings/blazor/`):

```text
bindings/blazor/
  src/MdlibPure.Blazor/                 the Razor class library (the NuGet package)
    wwwroot/MdlibPure.Blazor.lib.module.js   JS initializer
    wwwroot/dist/                       generated by `npm run blazor:assets` (gitignored)
    Scripts/mdlib-service.js            source of dist/mdlib-service.js (IMarkdownService)
  samples/MdlibPure.Blazor.Demo/        Blazor Web App: one page per render mode
  tests/MdlibPure.Blazor.Tests/         bUnit tests
```

From the repository root (Node ≥ 22.18 and the .NET 10 SDK):

```sh
npm ci
npm run blazor:assets          # bundles src/ + styles/ + KaTeX + Mermaid into wwwroot/dist/
dotnet build bindings/blazor/MdlibPure.Blazor.slnx
(cd bindings/blazor && dotnet test)   # bUnit; global.json there selects Microsoft.Testing.Platform
npx playwright install chromium   # once
npm run test:blazor            # end-to-end: builds and starts the demo, drives every render mode
dotnet pack bindings/blazor/src/MdlibPure.Blazor -c Release -o packages   # → packages/MdlibPure.Blazor.0.1.0.nupkg
```

Run the demo: `dotnet run --project bindings/blazor/samples/MdlibPure.Blazor.Demo/MdlibPure.Blazor.Demo`,
then open <http://localhost:5088>.

Run `npm run blazor:assets` again after changing mdlib-pure's `src/` or
`styles/`. The npm package itself stays zero-dependency: KaTeX and Mermaid are
dev dependencies of the repository, shipped only inside the NuGet package.

## License

MIT © Michele Polo. The package's `wwwroot/dist/` bundles KaTeX (MIT), Mermaid
(MIT) and their dependencies: see `wwwroot/dist/THIRD-PARTY-NOTICES.txt` in
the package (`_content/MdlibPure.Blazor/dist/THIRD-PARTY-NOTICES.txt` in an app).
