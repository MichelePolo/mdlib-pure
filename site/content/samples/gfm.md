## Tables

| Syntax | Markdown | Result |
|:--|:--:|--:|
| Emphasis | `*a*` | *a* |
| Strong | `**a**` | **a** |
| Strikethrough | `~~a~~` | ~~a~~ |

## Task lists

- [x] CommonMark 0.31.2
- [x] GFM extensions
- [ ] Your plugin

## Strikethrough and autolinks

The ~~old~~ new renderer. Links without brackets: www.commonmark.org,
https://github.github.com/gfm/ and an address like info@example.com.

## Footnotes

Parsing stays linear on adversarial input.[^adversarial]

[^adversarial]: Checked by `test/pathological.test.ts` in the repository.

## Alerts

> [!NOTE]
> Alerts are blockquotes whose first line is `[!KIND]`.

> [!TIP]
> Neutral colors derive from `currentColor`.

> [!WARNING]
> `tagfilter` is not a sanitizer.
