# A first-level heading

A paragraph with *emphasis*, **strong emphasis**, `inline code` and a
[link with a title](https://commonmark.org "CommonMark"). Adjacent lines
make one paragraph; two trailing spaces  
make a hard line break.

## Lists

1. Ordered lists
2. may contain
   - bullet lists,
   - nested

- A [reference link][spec]
- An autolink: <https://spec.commonmark.org/0.31.2/>
- Entities: &copy; &mdash; &frac12;
- Escapes: \*not emphasis\*

> A block quote can hold **any** block.
>
> ```js
> const md = createMarkdown()
> ```

    Code indented by four spaces.

***

<b>Raw HTML</b> stays text: the `html` option is off by default.

[spec]: https://spec.commonmark.org "The CommonMark spec"
