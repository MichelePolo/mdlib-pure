// Samples shown on /samples/ and offered by the playground. Sources live in
// site/content/samples/<id>.md. `plugins` are ids from plugins.js; `special`
// marks samples whose page shows extra configuration (see pages/samples.js).
export const SAMPLES = [
  {
    id: 'commonmark',
    title: 'CommonMark basics',
    plugins: [],
    description: 'Headings, emphasis, links, nested lists, block quotes, code, entities and escapes: the core alone, no plugins. Raw HTML stays text because `html` is off by default.',
  },
  {
    id: 'gfm',
    title: 'GitHub Flavored Markdown',
    plugins: ['gfm'],
    description: 'Aligned tables, task lists, strikethrough, extended autolinks, footnotes and GitHub alerts, with `gfm()`.',
  },
  {
    id: 'math',
    title: 'Math with KaTeX',
    plugins: ['math'],
    description: 'The `math` plugin outputs `\\(…\\)` and `\\[…\\]`, the default delimiters of KaTeX auto-render: here KaTeX typesets the formulas in the browser with no configuration.',
  },
  {
    id: 'mermaid',
    title: 'Mermaid diagrams',
    plugins: ['mermaid'],
    description: 'The `mermaid` plugin turns ```` ```mermaid ```` fences into `<pre class="mermaid">`. Here `renderMermaid()` loads Mermaid only because this page has diagrams, and themes them from the `--md-*` tokens: switch the color scheme and they are redrawn. Without JavaScript you would see the source.',
    playground: false,
  },
  {
    id: 'deflist',
    title: 'Definition lists',
    plugins: ['deflist'],
    description: 'Terms and definitions, Pandoc and PHP Markdown Extra style, rendered as `<dl>`, `<dt>` and `<dd>`.',
  },
  {
    id: 'container',
    title: 'Containers',
    plugins: ['container'],
    description: 'Fenced `:::` blocks with a kind and an optional title, nestable with longer fences. The kind becomes the class `md-container-KIND`; the look is up to the site.',
  },
  {
    id: 'mark',
    title: 'Highlighted text',
    plugins: ['mark'],
    description: '`==text==` becomes `<mark>`, with the flanking rules of emphasis. A `==` line under a paragraph is still a setext heading.',
  },
  {
    id: 'frontmatter',
    title: 'Front matter',
    plugins: ['frontmatter'],
    description: 'YAML or TOML metadata at the top of a document: kept out of the output, readable with `getFrontmatter()`.',
    special: 'frontmatter',
  },
  {
    id: 'highlight',
    title: 'Syntax highlighting hook',
    plugins: [],
    description: 'The `highlight(code, lang, meta)` option takes any highlighter. This site uses a tokenizer of a few lines that returns VNodes, so the output stays on the safe path of `renderTo()`.',
    special: 'highlight',
  },
  {
    id: 'tailwind',
    title: 'Tailwind classes map',
    plugins: [],
    description: 'Without the theme, the `classes` option gives each node type its utility classes. The preview uses a real Tailwind CSS v4 build, isolated in a shadow root.',
    special: 'tailwind',
    playground: false,
  },
  {
    id: 'react',
    title: 'React adapter',
    plugins: ['gfm'],
    description: '`mdlib-pure/adapter` turns VNodes into React, Preact or Vue elements. This preview was produced by `react-dom/server` when the site was built.',
    special: 'react',
    playground: false,
  },
]

/** The playground's first sample: the text of the original demo editor. */
export const WELCOME = { id: 'welcome', title: 'Welcome', plugins: ['gfm'], description: 'The text of the first demo editor.' }
