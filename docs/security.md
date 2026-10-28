# Security

Markdown rendered in a browser is often untrusted: comments, chat messages,
CMS content, LLM output. This page lists what mdlib-pure guarantees by
default and what depends on your configuration.

## Defaults

| Threat | Default behavior |
|---|---|
| Raw HTML (`<script>`, `<img onerror>`) | `html: false`: HTML is **not recognized**. It renders as escaped text, and Markdown around it still works. |
| `javascript:`/`vbscript:`/`data:` URLs | Every `href`/`src` goes through `allowUrl` (default `isSafeUrl`). Rejected URLs become `""`. Entity and percent-encoding tricks are decoded or neutralized before the check. |
| Markup injection through text | Text is escaped by the HTML serializer; `renderTo()` uses `createTextNode`/`setAttribute`. |
| Prototype pollution / lookup | Lookups keyed by input (entities, renderers, classes) use `Map` or `Object.hasOwn`. |
| Denial of service (CPU) | Parsing is linear in input size. `test/pathological.test.ts` runs 30+ adversarial inputs (nested emphasis and brackets, unclosed constructs, ReDoS-shaped strings, GFM tables and autolinks) with time limits. |
| Denial of service (stack) | Container and inline nesting are capped at `MAX_NESTING` (100); deeper markers render as text. |
| Output amplification | GFM table rows can add at most 524,288 empty cells in total. |

## When raw HTML is enabled

`html: true` passes raw HTML through **unchanged**. Use it only for trusted
input, or with a sanitizer:

```js
import DOMPurify from 'dompurify'
createMarkdown({ html: true, sanitize: DOMPurify.sanitize })
```

- `render()` applies `sanitize` to the final HTML string.
- `renderTo()` builds DOM nodes directly when the tree has no raw HTML.
  With raw HTML (or a plugin emitting `r.raw()`), it serializes and assigns
  `innerHTML`, after `sanitize`. This is the only `innerHTML` in the library
  besides the entity decoder (which only ever receives `[a-z0-9]` names).
- The GFM plugin includes **tagfilter**: `<script>`, `<iframe>`, `<style>`,
  `<textarea>`, `<title>`, `<xmp>`, `<noembed>`, `<noframes>` and
  `<plaintext>` are neutralized. It is a GitHub-compatible filter, **not a
  sanitizer**: event handler attributes survive it.

## URL policy

The default `isSafeUrl(url, kind)` is an **allowlist**:

| URL | Links | Images |
|---|---|---|
| relative (`/a`, `a/b`, `#frag`, `?q`, `//host/path`) | ✓ | ✓ |
| `http:`, `https:` | ✓ | ✓ |
| `mailto:`, `tel:`, `sms:` | ✓ | ✓ |
| `data:image/png`, `gif`, `jpeg`, `webp` | ✗ | ✓ |
| `data:image/svg+xml` (can carry scripts), any other `data:` | ✗ | ✗ |
| everything else (`javascript:`, `vbscript:`, `file:`, `ftp:`, app links…) | ✗ | ✗ |

Rejected URLs render as `href=""` / `src=""`: the link text stays visible.
Note that GFM autolinks like `ftp://host` are therefore not clickable by
default.

Replace or extend the policy:

```js
import { createMarkdown, isSafeUrl } from 'mdlib-pure'

createMarkdown({
  allowUrl: (url, kind) => isSafeUrl(url, kind) || /^vscode:/i.test(url),
})
```

## Plugins

Plugins run with full trust. A plugin must:

- pass URLs through `r.url(url, kind)`;
- return text as plain strings (escaped by the serializer), never build HTML
  strings from input;
- use `r.raw()` only for HTML it fully controls;
- keep its parsing linear (see rule 8 in `AGENTS.md`).

## Reporting

Report vulnerabilities privately to the maintainer (Michele Polo) rather than
in public issues.
