# The complete demo editor

[Open the editor](https://michelepolo.github.io/mdlib-pure/playground/).
The homepage's primary action and the “Editor demo” navigation item open it.
Its command bar is inspired by SharePoint, with a light or dark theme selected
in the site header. The editor controls are in Italian.

## Write, preview and read

- **Scrivi** gives the source the full width.
- **Split**, the default, shows Markdown and live output together. On narrow
  screens the two panes stack vertically. Vertical scrolling is synchronized
  in both directions by relative document position, also in HTML/AST views.
  Different block heights mean this is proportional, not line-by-line alignment.
- **Leggi** hides the source and toolbar and selects the rendered preview.

The toolbar inserts headings H1–H6, emphasis, strikethrough, highlighting,
inline/fenced code, links and reference links, images, quotes, lists, tasks,
separators, tables, footnotes, all five GFM alerts, containers, definitions,
inline/block math, Mermaid diagrams, YAML/TOML metadata, hard breaks, escapes,
entities and autolinks. Hover a button for its tooltip; every button has an accessible label and
supports native keyboard activation. Select text before applying a marker.
Required plugins are enabled automatically. Metadata is inserted at the start;
edit an existing metadata block instead of inserting another one.

Ctrl/Cmd+B and Ctrl/Cmd+I apply emphasis. Ctrl/Cmd+Z undoes text changes;
Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes them. The last 100 text states are kept for
the session. Plugin settings are independent of text undo.
Samples, plugin toggles, HTML/AST inspection and compressed sharing links remain
available. Drafts are saved locally when storage is available; shared links
include the source and settings, so share them only with the intended recipients.

## Export

Choose a document name, then:

- **MD** downloads the original UTF-8 Markdown.
- **HTML** downloads a styled document with rendered math and diagrams. The
  core CSS is embedded; KaTeX fonts/CSS and remote images still require network
  access. Export uses a light background and does not include executable scripts.
- **PDF** prepares the same document and opens the browser print dialog. Choose
  **Save as PDF** and the desired paper size. This is browser printing, not a
  server upload or a direct PDF download. External images that cannot load in
  five seconds need to be retried before printing.

Raw HTML remains escaped and unsafe link schemes are filtered by mdlib-pure.
Mermaid uses its strict security mode. The print frame disables scripts.
Math and diagram engines load on demand from this site's bundled assets.
The existing service worker supports the basic editor offline; diagram assets
are not guaranteed to be cached, so diagrams and their export may need a network.

This is a site application built on the existing parser and renderers. It adds
no package export, syntax, Web Component attribute or wrapper API; Angular,
Blazor and React/Vue/Preact integrations remain as documented in their guides.
Implementation: `site/build/pages/playground.js`, `site/client/playground.js`,
`site/lib/editor-commands.js`, and `site/assets/site.css`.
