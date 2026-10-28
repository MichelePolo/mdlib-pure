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

## AGENTS.md is the extension contract

[`AGENTS.md`](/docs/extending/) is the single source of truth for agents
working on mdlib-pure. It has:

- **Non-negotiable rules**, each with the command that verifies it: zero
  runtime dependencies, CommonMark 652/652, size budgets, no HTML sinks,
  erasable TypeScript, tests with adversarial input, semantic CSS tokens,
  linear regexes, `Map` lookups for input-keyed data.
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

## It has been done

The `container`, `math`, `mark`, `frontmatter` and `deflist` plugins were
written by agents from `AGENTS.md`, and the friction the first agent ran
into was folded back into the guide. The [story of the
library](/story/) has the details, from the git history.

## Machine-friendly by design

- Complete static HTML with semantic landmarks (`header`, `nav`, `main`,
  `footer`), stable heading ids and code blocks with `language-*` classes.
- [`/sitemap.xml`](/sitemap.xml), and a [`/robots.txt`](/robots.txt) that
  allows all crawlers, AI agents included.
- `SoftwareSourceCode` JSON-LD on the home page.
