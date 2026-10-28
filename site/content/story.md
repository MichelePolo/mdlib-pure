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

## Checked on every change

`npm run verify` runs the type checker, the tests, the invariants (zero
dependencies, no HTML sinks) and the size budgets. GitHub Actions runs it on
Node 22 and 24, plus a Chromium suite with Playwright: CommonMark through the
DOM, `renderTo()` never assigning `innerHTML` without raw HTML, hostile
Markdown unable to run script, the theme, and a real Tailwind build
([297d6af]).

## This site

This site was built the same way: an agent in Claude Code wrote the build
script, the pages and the playground. The docs are the repository's Markdown
rendered by mdlib-pure itself, and the screenshots below were taken with
Playwright.

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
