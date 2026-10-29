# Built with AI

mdlib-pure was designed by Michele Polo and written with Claude (Anthropic)
through Claude Code. The maintainer sets the direction and makes the calls;
agents write the code, the tests and the docs, review the work and try to
break it. This page tells how, with facts from the git history and the
[changelog](/docs/changelog/).

{{stats}}

## A contract written for agents

The first commit already shipped [`AGENTS.md`](/docs/extending/): rules that
each come with the command that verifies them, and recipes for extending the
parser. To test it, an agent implemented the `:::` container plugin using
only that file ([5a482ba]). Its friction log changed both the core
(`finalize()` now closes a block's open children) and the guide, which
gained the container recipe, the ordering rules against GFM table rows and
the per-line cost of `continue`.

From then on, first-party plugins were written by agents from `AGENTS.md`:

| Plugin | gzip at the time | Tests | Commit |
|:--|--:|--:|:--|
| `mdlib-pure/container` | 0.81 KB | 37 | [5a482ba] |
| `mdlib-pure/math` | 0.91 KB | 65 | [1c4dd87] |
| `mdlib-pure/mark` | 0.13 KB | 37 | [1c4dd87] |
| `mdlib-pure/frontmatter` | 0.57 KB | 38 | [1c4dd87] |
| `mdlib-pure/deflist` | 1.22 KB | 54 | [53f6b0f] |

The benchmark suite in `bench/` was built by an agent too ([cb973e5]).

## Bugs found by adversarial tests and reviews

Every new syntax ships with adversarial-input tests, and agents reviewed the
code looking for ways to break it. Some of what they found, with the numbers
from the commits that fixed it:

- **Inherited ReDoS.** The link title regex had overlapping alternatives
  (exponential backtracking), inherited from the reference implementation,
  and unanchored trailing-whitespace regexes were quadratic. Rewritten, and
  `AGENTS.md` gained its rule on linear regexes ([b6fde7c]).
- **Prototype lookup.** `&constructor;` resolved to `Object.prototype` in the
  fallback entity decoder: now a `Map`, and a rule ([b6fde7c]).
- **Quadratic GFM tables.** Opening a table split the whole paragraph on
  every delimiter-like line: 7.5 s on 30k lines, then 110 ms. Unbounded
  footnote labels: 805 ms, then 82 ms ([ea3dfd8]).
- **Deep emphasis.** Interleaved delimiters nested past `MAX_NESTING` took
  3.8 s at 60k, then 91 ms. Found by an agent review, with three more fixes
  in the same commit ([74de6d1]).
- **Quadratic sibling search.** Many setext headings or one-row tables took
  1.1 s at 100k; now linear ([53f6b0f]).
- **Unsanitized adapter output.** With `html: true` and `sanitize`,
  `toVNodes()` was not sanitized, so the framework adapter passed raw HTML to
  `dangerouslySetInnerHTML`. The regression test fails on the previous
  version ([e440762]).
- **Tailwind clash.** A real Tailwind CSS v4 build showed that
  `@theme inline { --radius-md }` replaced Tailwind's own `rounded-md` for the
  whole project ([27395d2]).
- **CSS source order.** A screenshot of the first demo editor revealed that,
  with zero-specificity rules, source order decides: the first heading kept
  its top margin and alerts had extra space below. The edge resets moved to
  the end of the theme ([ea3dfd8]; the screenshot is below).
- **A timing test that only failed on CI.** A 4 MB adversarial input took
  2.2 s on the CI runner, over the 2 s limit, while parsing was linear
  (~130 ms/MB). The first attempted fix made paragraphs quadratic; measuring
  caught it and it was reverted. The input shrank to 1 MB and every timing
  limit became `budget(ms)`, tripled on CI ([a593dd7]).

## Web Components, then Blazor

`mdlib-pure/element` added two custom elements that work in plain HTML and in
any framework: `<mdlib-markdown>`, a viewer, and `<mdlib-editor>`, an editor
with toolbar and live preview ([7f25396]). They were written as the base of a
Blazor wrapper. Core, every plugin and both elements came to 19.8 KB gzip at the time,
within a 26 KB budget; KaTeX and Mermaid come through loaders, fetched only
when a document needs them. The commit shipped with 7 Chromium tests.

An agent then built `MdlibPure.Blazor` on the elements, and the work was
reviewed ([13c87c3]): a Razor class library for .NET 10 with a viewer, an
editor bound with `@bind-Value`, and a C# service for the AST. It has 48 bUnit
tests and 20 Playwright end-to-end tests across Static SSR, Interactive
Server, WebAssembly and Auto. Version 0.1.0 is attached to a
[GitHub release](https://github.com/MichelePolo/mdlib-pure/releases/tag/blazor-v0.1.0);
the guide is [its README](/docs/blazor/).

Building the wrapper found three problems in the elements, each reproduced
in a test before the fix ([60c7298]):

- **DOM morphing.** Blazor enhanced navigation (like Turbo and htmx) empties
  elements it did not create, and the elements never recovered. A
  `MutationObserver` now renders the viewer again and puts back the editor's
  toolbar and panes, keeping the typed text.
- **A stylesheet that disappeared.** The KaTeX stylesheet was a `<link>`
  added once, which a morph removed for good. It is now adopted through
  `document.adoptedStyleSheets`, with absolute font URLs.
- **Late loaders.** Elements defined before their loaders never drew math or
  diagrams. Every `defineElements()` call now refreshes the elements already
  in the page.

Then a rule for the docs ([8dcf108]): rule 10 of `AGENTS.md`, checked by
`npm run check`, requires every public entry point to be documented in
`docs/api.md` and the README, and every `docs/*.md` and
`bindings/*/README.md` to be linked from the README. This site adds the other
half: its build fails when one of those guides is not published as a docs
page. That is how the [Web Components guide](/docs/elements/) and the
[Blazor README](/docs/blazor/) became pages here.

## Then Angular

A second agent built `ngx-mdlib-pure` on the same elements, in a git worktree
of its own so that it could not collide with the agent updating this site
([5a551cd]). The package has standalone components whose tag *is* the Web
Component (`<mdlib-editor [(value)]>`, also a form control for `ngModel` and
reactive forms, and `<mdlib-markdown>`), a provider, and a service for the
AST that also runs on the server. It is checked by 29 unit tests in Chromium
and 11 end-to-end tests against a server-rendered, hydrated demo. Its
[README](/docs/angular/) became a docs page here in the same commit, since
the site build requires it.

Building and reviewing it found four problems outside the wrapper, each now
covered by a test or a check:

- **No disabled state.** Inside `<fieldset disabled>`, the editor still took
  typing. It now disables its text area and formatting buttons, like a
  disabled `<textarea>`.
- **A loader type that rejected KaTeX.** The documented
  `katex: () => import('katex/contrib/auto-render').then((m) => m.default)`
  did not compile under strict TypeScript. `npm run typecheck` now compiles
  it against KaTeX's own types.
- **Warnings in every build.** Bare `import "./chunk-*.js"` lines in `dist/`
  made each consumer's bundler warn ten times. The build removes them.
- **A stale copy in the cache.** Vite kept serving the mdlib-pure it had
  pre-bundled before a rebuild, so the unit tests ran against old code. The
  Angular workspace now drops that cache before testing.

Nothing is on a package registry yet. The README, the guides, `AGENTS.md`
and this site say so, and each gives the tarball to install today, attached
to a GitHub release.

## The maintainer decides

Agents propose; Michele decides. Some of the decisions in the history:

- The URL policy: an allowlist of `http`, `https`, `mailto`, `tel`, `sms` and
  relative URLs, with `data:` only for raster images ([9175b67]).
- Heading ids: first prefixed with `user-content-` by default ([9500a6b]),
  then clean by default, with the prefix recommended for untrusted input
  ([6303064]).
- The core size budget raised to 15 KB, to recover 39% of GFM throughput
  ([caf2d63]).
- Pandoc-style math output, so that KaTeX auto-render and MathJax work with
  no configuration ([691260a]).
- Mermaid diagrams: costs and benefits were laid out before any code
  (Mermaid 12 measured at 215 KB gzip on first load). Chosen: no dependency
  on Mermaid, lazy loading, theme from the tokens with redraw on light/dark,
  pre-rendered output only through a `render` option ([287334c]).
- The Blazor wrapper: built on the Web Components, in this repository, for
  .NET 10, in every render mode, with every plugin and access to the AST, and
  no server-side rendering of the Markdown for SEO ([13c87c3]).
- The repository made public and this site published on GitHub Pages
  ([ba0b3a4]).
- Publishing on npm put on hold, and the Blazor package released only on
  GitHub. The Angular wrapper followed, built on the same elements, and the
  docs say plainly that nothing is on a registry yet ([5a551cd]); the npm
  tarballs of mdlib-pure and the Angular wrapper are attached to GitHub
  releases as well.

## Checked on every change

`npm run verify` runs the type checker, the tests, the invariants (zero
dependencies, no HTML sinks) and the size budgets. GitHub Actions runs it on
Node 22 and 24, plus a Chromium suite with Playwright: CommonMark through the
DOM, `renderTo()` never assigning `innerHTML` without raw HTML, hostile
Markdown unable to run script, the theme, and a real Tailwind build
([297d6af]). A `blazor` job builds, tests and packs the wrapper and runs its
end-to-end tests ([13c87c3]).

## This site

This site was built the same way: an agent in Claude Code wrote the build
script, the pages and the playground. The docs are the repository's Markdown
rendered by mdlib-pure itself, and the screenshots below were taken with
Playwright. Checking the Mermaid sample in a real browser found two problems
that unit tests had not: this site switches themes through
`<meta name="color-scheme">`, which the redraw did not watch, and Mermaid's
black default edge-label background in dark mode. Both were fixed in the
library ([287334c]). The [samples](/samples/#elements) include a live
`<mdlib-editor>` and `<mdlib-markdown>`, defined from the library's sources
with this site's own copies of KaTeX and Mermaid as loaders.

[5a482ba]: https://github.com/MichelePolo/mdlib-pure/commit/5a482ba
[1c4dd87]: https://github.com/MichelePolo/mdlib-pure/commit/1c4dd87
[53f6b0f]: https://github.com/MichelePolo/mdlib-pure/commit/53f6b0f
[cb973e5]: https://github.com/MichelePolo/mdlib-pure/commit/cb973e5
[b6fde7c]: https://github.com/MichelePolo/mdlib-pure/commit/b6fde7c
[ea3dfd8]: https://github.com/MichelePolo/mdlib-pure/commit/ea3dfd8
[74de6d1]: https://github.com/MichelePolo/mdlib-pure/commit/74de6d1
[e440762]: https://github.com/MichelePolo/mdlib-pure/commit/e440762
[27395d2]: https://github.com/MichelePolo/mdlib-pure/commit/27395d2
[9175b67]: https://github.com/MichelePolo/mdlib-pure/commit/9175b67
[9500a6b]: https://github.com/MichelePolo/mdlib-pure/commit/9500a6b
[6303064]: https://github.com/MichelePolo/mdlib-pure/commit/6303064
[caf2d63]: https://github.com/MichelePolo/mdlib-pure/commit/caf2d63
[691260a]: https://github.com/MichelePolo/mdlib-pure/commit/691260a
[297d6af]: https://github.com/MichelePolo/mdlib-pure/commit/297d6af
[a593dd7]: https://github.com/MichelePolo/mdlib-pure/commit/a593dd7
[287334c]: https://github.com/MichelePolo/mdlib-pure/commit/287334c
[ba0b3a4]: https://github.com/MichelePolo/mdlib-pure/commit/ba0b3a4
[7f25396]: https://github.com/MichelePolo/mdlib-pure/commit/7f25396
[60c7298]: https://github.com/MichelePolo/mdlib-pure/commit/60c7298
[13c87c3]: https://github.com/MichelePolo/mdlib-pure/commit/13c87c3
[8dcf108]: https://github.com/MichelePolo/mdlib-pure/commit/8dcf108
[5a551cd]: https://github.com/MichelePolo/mdlib-pure/commit/5a551cd
