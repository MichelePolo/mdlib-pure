# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (before 1.0, minor versions may
break the API).

## [0.1.0] — unreleased

First release. Not on a registry yet: mdlib-pure and ngx-mdlib-pure are not
on npm, MdlibPure.Blazor is not on nuget.org (see README.md, "Install").

### Core (`mdlib-pure`, ~11 KB gzip, zero dependencies)

- CommonMark 0.31.2: all 652 spec examples pass (also in Chromium with the
  DOM-based entity decoder).
- Two-phase parser (blocks, then inlines) with an extensible rule registry:
  block rules, inline rules, delimiter rules, AST transforms, render
  overrides; ordering with `before`/`after`, replacement by name.
- mdast-compatible AST; optional block `position`s.
- Output as HTML string, DOM (`renderTo`, no HTML parsing unless raw HTML is
  present) or VNodes.
- Options: `html`, `sanitize`, `allowUrl`, `decodeEntity`, `classes`,
  `attributes`, `highlight`, `positions`.
- Safe defaults: raw HTML not recognized; URL allowlist (http, https,
  mailto, tel, sms, relative; raster `data:` images only); `sanitize`
  applied on every output path.
- Linear time on adversarial input; nesting capped at `MAX_NESTING`.
- Throughput on par with marked, ahead of markdown-it (see `bench/`).

### Plugins and integrations

- `mdlib-pure/gfm`: tables, strikethrough, extended autolinks, task lists,
  footnotes, tag filter, GitHub alerts (54/54 GFM extension examples).
- `mdlib-pure/headings`: GitHub-compatible heading ids, permalinks, `toc()`.
- `mdlib-pure/container`: `:::` container blocks.
- `mdlib-pure/math`: `$…$`, `$$…$$`, `$$` blocks, `render` hook for KaTeX/MathJax.
- `mdlib-pure/deflist`: definition lists.
- `mdlib-pure/mark`: `==highlight==`.
- `mdlib-pure/frontmatter`: YAML/TOML front matter.
- `mdlib-pure/mermaid`: Mermaid diagrams without depending on Mermaid;
  lazy loading, strict security level, theme from the tokens.
- `mdlib-pure/adapter`: React, Preact and Vue elements.
- `mdlib-pure/element`: `<mdlib-markdown>` and `<mdlib-editor>` Web
  Components (editor with live preview, debounced events, echo-safe value
  binding, form-associated, disabled by `disabled` or a `<fieldset>`) and
  `editor.css`. The `katex` loader takes KaTeX's own `renderMathInElement`.
- `mdlib-pure/entities`: full entity table for non-browser environments.
- `theme.css` with semantic `--md-*` tokens (light/dark via `color-scheme`);
  `tailwind.css` for Tailwind CSS v4.

### Bindings

- `MdlibPure.Blazor` 0.1.0 (NuGet, in `bindings/blazor/`, not on nuget.org;
  the `.nupkg` is on the GitHub release `blazor-v0.1.0`): `<Markdown>` and
  `<MarkdownEditor @bind-Value>` for every Blazor render mode,
  `IMarkdownService` for the AST, KaTeX and Mermaid bundled and loaded on
  demand.
- `ngx-mdlib-pure` 0.1.0 (npm, in `bindings/angular/`, not published yet):
  `MarkdownEditor` (`<mdlib-editor [(value)]>`, a `ControlValueAccessor` for
  `ngModel` and reactive forms) and `MarkdownViewer` (`<mdlib-markdown>`) as
  standalone components for Angular 21 and 22, `provideMdlibPure()`,
  `MarkdownService` (AST, TOC, HTML, also on the server); SSR with hydration.

### Tooling

- `AGENTS.md` guide for AI agents, tested by having an agent build a plugin
  from it; plugin template; CI on Node 22/24 and Chromium.
- `npm pack` builds `dist/` (`prepack`); `dist/` has no bare chunk imports,
  so bundlers print no "Ignoring this import" warnings.
