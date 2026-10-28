```js
// A minimal highlighter: returns VNodes, not HTML
const md = createMarkdown({
  highlight: (code, lang) => (lang === 'js' ? tokens(code) : null),
})
md.render('# Hello')
```

```css
:root {
  --md-color-link: oklch(55% 0.2 260);
}
```

```sh
npm install mdlib-pure
```
