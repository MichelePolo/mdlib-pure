# For AI agents

This site is written to be read by AI coding agents (Claude Code, Codex,
Cursor, Copilot, Gemini…) as well as by people. Everything on it is static
HTML with a Markdown twin; no JavaScript is needed to read the docs or the
samples.

## Where to start

1. Read [`/llms.txt`](/llms.txt): the index of the site in the
   [llms.txt](https://llmstxt.org) format, linking the Markdown version of
   every page.
2. For everything in one file, read [`/llms-full.txt`](/llms-full.txt): all
   the docs concatenated.
3. Any page is also available as Markdown at the same path with `.md`, for
   example [`/docs/api.md`](/docs/api.md). Each HTML page announces it in its
   head with `<link rel="alternate" type="text/markdown">`. The docs twins are
   the repository's Markdown files, with links pointing to the other twins.
4. To use the library in an app rather than extend it, read the guide for
   the way in: [`docs/elements.md`](/docs/elements/) for the Web Components,
   [`bindings/blazor/README.md`](/docs/blazor/) for Blazor,
   [`bindings/angular/README.md`](/docs/angular/) for Angular (see
   [below](#using-it-in-an-app)).
5. Nothing is on a package registry yet: `npm install mdlib-pure` and
   `dotnet add package MdlibPure.Blazor` fail. See
   [Not on a registry yet](#not-on-a-registry-yet).

## AGENTS.md is the extension contract

[`AGENTS.md`](/docs/extending/) is the single source of truth for agents
working on mdlib-pure. It has:

- **Non-negotiable rules**, each with the command that verifies it: zero
  runtime dependencies, CommonMark 652/652, size budgets, no HTML sinks,
  erasable TypeScript, tests with adversarial input, semantic CSS tokens,
  linear regexes, `Map` lookups for input-keyed data, and docs kept complete
  for humans and agents (every entry point in `docs/api.md` and the README,
  every guide linked from the README).
- **How parsing works**: the block phase, the inline phase, transforms,
  rendering, and per-parse state in `env`.
- **A decision tree** for choosing the extension point (block rule,
  delimiter rule, inline rule, transform, render override) and a recipe for
  each.
- **A definition of done**: `npm run verify` passes, new syntax has
  positive, negative and adversarial tests, new AST nodes are documented.

`templates/plugin` in the repository is a complete, tested plugin to copy.

## How to ask an agent to write a plugin

Point the agent at `AGENTS.md`, describe the syntax and the output, and ask
for the checks the guide requires. For example:

```text
Read AGENTS.md in the mdlib-pure repository and follow its rules.
Write a plugin `mention` that turns @user into a link to /u/user:
- use an inline rule triggered by '@' (recipe "Inline rule");
- pass the URL through r.url(url, 'link');
- add positive, negative and adversarial-input tests (parsing stays linear);
- document the AST node in the header comment of the file;
- run npm run verify before you say it is done.
```

For block syntax, name the closest model in the guide ("a fenced block like
the `:::` container") so the agent reads the container recipe, its pitfalls
(`canContain`, `endLine`, deferred closers) and the per-line cost of
`continue`.

For syntax rendered by a heavy library (diagrams, math, charts), ask for the
pattern in the guide's "Integrating an external library" section: the plugin
outputs the markup the library already recognizes and never imports it, a
browser helper loads the library only when a page needs it, and a `render`
option accepts pre-rendered output. `mdlib-pure/mermaid` and
`mdlib-pure/math` follow it.

## Using it in an app

Three guides cover embedding the library; all are docs pages here, so they
are in [`/llms-full.txt`](/llms-full.txt) and have `.md` twins:

- [`docs/elements.md`](/docs/elements/): `mdlib-pure/element`, the
  `<mdlib-markdown>` viewer and the `<mdlib-editor>` editor with live
  preview, for plain HTML and any framework. Attributes, loaders for KaTeX
  and Mermaid, named configs (the only way to set functions or `html`),
  events and form value, frameworks that rewrite the page.
- [`bindings/blazor/README.md`](/docs/blazor/): `MdlibPure.Blazor` 0.1.0,
  the Blazor wrapper (.NET 10) built on those elements: `<MarkdownEditor>`
  and `<Markdown>` in every render mode, `IMarkdownService` for the AST. It is
  not on nuget.org: the `.nupkg` is attached to the
  [GitHub release](https://github.com/MichelePolo/mdlib-pure/releases/tag/blazor-v0.1.0).
- [`bindings/angular/README.md`](/docs/angular/): `ngx-mdlib-pure` 0.1.0, the
  Angular wrapper (21, 22) built on the same elements: `MarkdownEditor` with
  `[(value)]` and a `ControlValueAccessor`, `MarkdownViewer`,
  `provideMdlibPure()`, `MarkdownService`, SSR with hydration. It is not on
  npm: its Install section builds both tarballs.

For example:

```text
Read bindings/blazor/README.md from the mdlib-pure repository.
Add a Markdown editor to the article edit page of this Blazor Web App
(Interactive Server): bind it to Article.Body with @bind-Value inside the
existing EditForm, enable MarkdownPlugins.Gfm | MarkdownPlugins.Math, and
raise MaximumReceiveMessageSize as the Setup section says.
```

```text
Read bindings/angular/README.md from the mdlib-pure repository.
Add a Markdown field to the reactive form of the article edit page of this
Angular app: <mdlib-editor formControlName="body" plugins="all">, required,
installed from the GitHub releases as the Install section says.
```

### Not on a registry yet

`mdlib-pure` and `ngx-mdlib-pure` are not on the npm registry, and
`MdlibPure.Blazor` is not on nuget.org. Install instructions you write must
use what works today:

- mdlib-pure: the tarball on the GitHub release `mdlib-pure-v0.1.0`,
  `npm install https://github.com/MichelePolo/mdlib-pure/releases/download/mdlib-pure-v0.1.0/mdlib-pure-0.1.0.tgz`,
  or `npm pack` in a clone (Getting started,
  [Install](/docs/getting-started/#install));
- Angular: that tarball and `ngx-mdlib-pure-0.1.0.tgz` from the GitHub release
  `angular-v0.1.0` ([Install](/docs/angular/#install));
- Blazor: the `.nupkg` from the GitHub release, through a local NuGet feed
  ([Install](/docs/blazor/#install)).

Do not publish on the maintainer's behalf: no `npm publish`, no `v*` tag (the
release workflow publishes to npm on it), no new or replaced release assets. `AGENTS.md` says the same, in its
section "Distribution".

Every `docs/*.md` and `bindings/*/README.md` of the repository is published
on this site: the site build fails if one is missing, so a new guide cannot
be forgotten.

## It has been done

The `container`, `math`, `mark`, `frontmatter` and `deflist` plugins were
written by agents from `AGENTS.md`, and the friction the first agent ran
into was folded back into the guide. The Blazor wrapper was built by an agent
on the Web Components; doing so found three robustness problems in the
elements, fixed with a test each. So was the Angular wrapper, which found
two more: the editor had no disabled state, and the KaTeX loader's type
rejected KaTeX's own function. The [story of the library](/story/) has the
details, from the git history.

## Machine-friendly by design

- Complete static HTML with semantic landmarks (`header`, `nav`, `main`,
  `footer`), stable heading ids and code blocks with `language-*` classes.
- [`/sitemap.xml`](/sitemap.xml), and a [`/robots.txt`](/robots.txt) that
  allows all crawlers, AI agents included.
- `SoftwareSourceCode` JSON-LD on the home page.
