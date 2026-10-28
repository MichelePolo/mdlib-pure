# mdlib-pure

A **zero-dependency** Markdown renderer with *semantic tokens*.
Visit www.commonmark.org or [the spec](https://spec.commonmark.org).

> [!TIP]
> Neutral colors derive from `currentColor`: switch the theme above.

## Lists

- [x] CommonMark 0.31.2 (652/652)
- [x] GFM: tables, ~~strikethrough~~, autolinks, task lists
- [ ] Your plugin here

1. Ordered
2. Lists

## Code

```js
const md = createMarkdown({ plugins: gfm() })
md.renderTo(element, source)
```

| Feature | Size (gzip) |
|:--|--:|
| core | ~11 KB |
| gfm | ~4 KB |

Footnotes work too.[^1]

---

[^1]: Rendered at the end, with back references.
