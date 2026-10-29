/** Markdown shown by the demo pages. */
export const WELCOME = String.raw`---
title: Release notes
---

# Release notes &ndash; ngx-mdlib-pure

Write on the left, read on the right: the preview follows **every keystroke**,
the Angular value below follows after a short pause.

## What's new

- [x] Tables, task lists and ~~strikethrough~~ (GFM)
- [x] ==Highlights==, footnotes[^1] and autolinks: www.commonmark.org
- [ ] Your feature here

| Binding | Preview | Angular value |
|:--|:--|:--|
| ${'`[(value)]`'} | in the browser | after a pause |
| Reactive forms, ${'`ngModel`'} | in the browser | after a pause, at once on blur |

> [!TIP]
> Use the toolbar, or Ctrl+B, Ctrl+I, Ctrl+K.

::: warning Raw HTML is off
<script>alert(1)</script> shows up as text, and [javascript: links](javascript:alert(1)) lose their URL.
:::

## Math and diagrams

Euler's identity, $e^{i\pi} + 1 = 0$, and a display formula:

$$
\int_0^1 x^2\,dx = \frac{1}{3}
$$

${'```'}mermaid
graph LR
  A[Markdown] --> B(mdlib-pure) --> C{Preview}
${'```'}

Definition list
: Term and definition, Pandoc style.

[^1]: Rendered at the end, with a back reference.
`

export const DESCRIPTION = `A **short** description, with a [link](https://angular.dev).`

export const NOTES = `- Bound with \`[(ngModel)]\`
- \`required\`: empty it to see the form become invalid`
