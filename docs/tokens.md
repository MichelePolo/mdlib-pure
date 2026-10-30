# Design tokens

`styles/theme.css` styles rendered Markdown through `--md-*` custom
properties. Put `class="md"` on the element that holds the HTML.

```html
<link rel="stylesheet" href="mdlib-pure/theme.css" />
<article class="md">…rendered markdown…</article>
```

## How the theme behaves

- **Zero specificity.** Every rule is inside `@layer mdlib` and `:where()`.
  Any class, utility or unlayered rule of yours wins, with no `!important`.
- **Inherits the page.** Text color and fonts are *not* set unless you set
  the tokens marked "unset" below: an undefined `var()` makes the property
  fall back to inheritance.
- **Neutrals follow the text color.** Borders, surfaces and muted text are
  `color-mix()` of `currentColor`, so they fit light and dark backgrounds
  without configuration.
- **Hues follow `color-scheme`.** Link, accent, mark and alert colors use
  `light-dark()`. Declare `color-scheme: light dark` on `:root` (and
  `<meta name="color-scheme" content="light dark">`), or `color-scheme: dark`
  on your `.dark` class.
- **Where tokens live.** Defaults are declared on `:root` and `:host` (so they
  also reach shadow DOM). Override them on `:root`, on `.md`, or on any
  ancestor to theme a single section.

Browser support: Baseline 2024.

## Color

| Token | Default | Used for |
|---|---|---|
| `--md-color-text` | unset (inherits) | body text |
| `--md-color-heading` | unset (inherits) | headings |
| `--md-color-muted` | `currentColor` at 68% | h6, footnotes, quote text |
| `--md-color-link` | `light-dark(#0969da, #4493f8)` | links |
| `--md-color-link-hover` | `light-dark(#0550ae, #79c0ff)` | links on hover |
| `--md-color-accent` | `var(--md-color-link)` | focus ring, task checkboxes |
| `--md-color-border` | `currentColor` at 18% | hr, table borders, quote border |
| `--md-color-surface` | `currentColor` at 5% | code blocks, table header |
| `--md-color-code-bg` | `currentColor` at 9% | inline code |
| `--md-color-quote` | `var(--md-color-muted)` | blockquote text |
| `--md-color-quote-border` | `var(--md-color-border)` | blockquote bar |
| `--md-color-mark` | `light-dark(#fff3a3, #6b5a0f)` | `<mark>` background |
| `--md-color-note` · `-tip` · `-important` · `-warning` · `-caution` | GitHub alert hues | `> [!NOTE]` alerts; `:::` containers of the same kinds (`info` = note, `danger` = caution) |

## Typography

| Token | Default | Used for |
|---|---|---|
| `--md-font-body` | unset (inherits) | container font |
| `--md-font-heading` | unset (inherits) | headings |
| `--md-font-mono` | `ui-monospace, …, monospace` | code |
| `--md-leading` | `1.6` | line height |
| `--md-leading-heading` | `1.25` | heading line height |
| `--md-weight-heading` | `600` | headings, table header |
| `--md-size-h1` … `--md-size-h6` | `2em 1.5em 1.25em 1.125em 1em 0.875em` | heading sizes |
| `--md-size-code` | `0.875em` | code |
| `--md-size-small` | `0.875em` | footnotes |

## Space and shape

| Token | Default | Used for |
|---|---|---|
| `--md-space-block` | `1em` | gap after each block |
| `--md-space-heading` | `1.5em` | gap before headings |
| `--md-space-indent` | `1.75em` | list indentation |
| `--md-space-item` | `0.25em` | gap between list items |
| `--md-pad-code` | `0.875em 1em` | code block padding |
| `--md-radius` | `0.375rem` | code, mark |
| `--md-border-width` | `1px` | hr, tables |

## Tailwind CSS v4

```css
@import "tailwindcss";
@import "mdlib-pure/tailwind.css";

/* Map the tokens to your design system */
:root {
  --md-color-link: var(--color-primary);
  --md-font-heading: var(--font-display);
}
.dark { color-scheme: dark; }
```

`tailwind.css` loads the theme into Tailwind's `components` layer, so
utilities always win, and `.md` looks the same with or without Tailwind:
the theme undoes what Tailwind's preflight resets inside it (list markers,
link underlines, inline images, heading sizes, spacing). A browser test
compares every element of a sample document in both setups. It also exposes the tokens as theme values:
`text-md-link`, `bg-md-surface`, `border-md-border`, `bg-md-code-bg`,
`text-md-muted`, `font-md-mono`. No radius utility is added: `rounded-md`
belongs to Tailwind (use `rounded-[var(--md-radius)]`).

Without the theme, plain semantic output works with `@tailwindcss/typography`
(`<article class="prose">`), or add utilities per node type with the
`classes` option (see the README).

## Naming rules (for contributors)

`--md-{category}-{role}[-{state}]`: `--md-color-link-hover`,
`--md-space-block`. Name the role, never the value: `--md-color-surface`,
not `--md-gray-50`. Every new token goes in this file.
