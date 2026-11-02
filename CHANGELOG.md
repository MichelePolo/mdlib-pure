# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) (before 1.0, minor versions may
break the API).

## [Unreleased]

mdlib-pure stays 0.1.1 (no change to the npm package). Wrapper releases:
`ngx-mdlib-pure` 0.2.0 (GitHub release `angular-v0.2.0`) and
`MdlibPure.Blazor` 0.2.0 (`blazor-v0.2.0`), both with the entries below.

### Changed

- `<mdlib-podcast-editor>` dispatches `change` only when focus leaves the
  editor (moves inside it do not count), like `<mdlib-editor>` and native
  inputs; before, it followed every typing pause. `input` is unchanged.

- `ngx-mdlib-pure` 0.1.1 (GitHub release `angular-v0.1.1`): requires
  `mdlib-pure ^0.1.1`, so apps get the `<mdlib-editor>` fixes of 0.1.1 (value
  set as a property before connection, missing form APIs). Same code as 0.1.0;
  the packaged README installs the 0.1.1 tarballs.

### Added

- Podcast sample: soundboard links. `[Sigla](sound:Sigla finale)` (or
  `soundboard:`) renders a `.podcast-sound` button that asks the hosting
  application to play that item of its soundboard; the editor option `sounds`
  (names the host has, compared ignoring case; `setSounds` live) disables the
  buttons whose name is unknown, `onPlaySound({ name, title })` reports a click.
  `<mdlib-podcast-editor>`: attribute `sounds` (JSON array) and event
  `podcast-sound`; Blazor `Sounds` / `OnPlaySound` (`PodcastSoundEventArgs`);
  Angular `sounds` / `playSound` (`PodcastSoundEvent`). For the next wrapper
  releases.

- Blazor `OnValueCommit` (MdlibPure.Blazor 0.2.0) on `MarkdownEditor` (`EventCallback<string?>`) and
  `PodcastEditor` (`EventCallback<PodcastEpisode>`): the user left the editor,
  after the pending `ValueChanged`. The counterpart of Angular's `valueCommit`.

- `ngx-mdlib-pure/podcast` (Angular, ngx-mdlib-pure 0.2.0):
  `PodcastEditor`, the podcast rundown editor as `<mdlib-podcast-editor>`
  with `[(value)]` of a typed `PodcastEpisode`, a `ControlValueAccessor`, and
  the Blazor component's hosting options (`grammar`, `tagColors`, `tasks`,
  `documents`, `readOnly`, `compact`, `currentLine`, `runningTimer`) and
  events. Tested in Chromium (unit) and in the SSR demo's `/podcast` page.
- `templates/podcast/element.js`: the `<mdlib-podcast-editor>` element, moved
  from the Blazor package and shared by both wrappers; `styles` also takes
  `CSSStyleSheet` objects.
- `npm run check` verifies binding parity (AGENTS.md rule 11): every plugin
  export has a name in the elements, the Blazor and Angular plugin lists match
  it, and every custom element is wrapped by both.

- Copyable podcast plugin example and split editor at `/podcast/`: participant
  completion, section durations (`[](time:5:00:00)`), interactive checkboxes,
  linked supporting documents, local drafts and per-document undo/redo.
  Markdown links open in a new browser tab. All sample people and content are
  fictional; the guide covers its Blazor integration.
  See `docs/podcast.md`; the library's package exports and core syntax are unchanged.

- Podcast sample, hosting options for an application with its own rundown server
  (defaults unchanged): grammar options of `podcast()` (`durations: 'clock'` with titled
  `[titolo](time:04:30)` tags, free `@name` / `#topic` tags with fixed, written or hashed
  colours, `lineBlocks`, `looseTasks`), `[titolo](doc:name)` document links, and editor
  options `tasks: 'notify'`, `documents: 'host'`, `readOnly`, `compact`, `current`,
  `runningTimer` (with an optional countdown text shown in the chip) with their callbacks. `PodcastEditor` exposes them as parameters and
  `EventCallback`s (`OnTaskToggle`, `OnOpenDocument`, `OnActiveDocumentChanged`), with
  `PodcastGrammar`, `PodcastTaskMode`, `PodcastDocumentMode`. New tokens `--podcast-height`,
  `--podcast-font-size`.

- Blazor wrapper 0.1.1 (GitHub release `blazor-v0.1.1`): `PodcastEditor` and `PodcastEpisode`,
  with configurable participants, typed episode binding, supporting documents,
  planned durations and automatic assets. Shared with the site sample; tested
  in Server, WebAssembly, Auto and Static SSR, including enhanced navigation.

## [0.1.1] — 2026-10-30

mdlib-pure only, as the npm tarball of the GitHub release `mdlib-pure-v0.1.1`
(still not on the npm registry). `ngx-mdlib-pure` 0.1.0 works with it
unchanged; `MdlibPure.Blazor` 0.1.0 still bundles the 0.1.0 elements and theme.

### Fixed

- `<mdlib-editor>`: a `value` set as a property before the element was
  connected (React 19, Vue) was replaced by the missing attribute, so the
  editor started empty; a `value` set before `defineElements()` hid the
  setter. Both now work ([#1](https://github.com/MichelePolo/mdlib-pure/issues/1)).
- `<mdlib-editor>` in test DOMs: no `TypeError` where `ElementInternals`
  has no `setFormValue()` (jsdom 29) or `attachInternals()` is missing.
- `theme.css` under Tailwind's preflight: list markers, link underlines and
  inline images are kept, so `.md` looks the same with or without Tailwind.
- `theme.css`: code blocks are 14px as intended (they were 11.4px: the
  browser's bare `monospace` shrinks em sizes); footnote references no
  longer stretch their line; task-list checkboxes line up with the indent.

## [0.1.0] — 2026-10-29

First release. Not on a registry yet: mdlib-pure and ngx-mdlib-pure are not
on npm, MdlibPure.Blazor is not on nuget.org. Each is attached to a GitHub
release instead (`mdlib-pure-v0.1.0`, `angular-v0.1.0`, `blazor-v0.1.0`; see
README.md, "Install").

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
