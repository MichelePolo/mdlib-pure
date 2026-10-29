# Development screenshots

Screenshots taken with Playwright (Chromium) while developing mdlib-pure.

| File | What it shows |
|---|---|
| `2026-10-28-demo-editor-light.png` | The first live editor (`demo/`), light theme: CommonMark + GFM (alert, task list, table, code, footnote) rendered with `theme.css`. Captured while checking the theme; it revealed a CSS source-order bug (top margin of the first heading, extra space under the alert) that was then fixed. |
| `2026-10-28-demo-editor-dark-full.png` | The same editor in dark mode, full page: neutral colors derive from `currentColor`, hues from `light-dark()`. |
| `2026-10-28-site-home-light.png` | The demonstration site (`npm run site:build`), home page, light, full page: hero with the live example, datasheet, plugins, benchmark, the section for AI agents. Display type is Computer Modern (KaTeX's fonts); Markdown markers in non-repro blue. |
| `2026-10-28-site-home-dark.png` | The same home page in dark mode, full page: the site's colours are `light-dark()` tokens like the theme's. |
| `2026-10-28-site-docs-light.png` | A docs page (`AGENTS.md` rendered by mdlib-pure at build time) with the sidebar and the table of contents from `toc()`, light. |
| `2026-10-28-site-docs-dark.png` | The same docs page in dark mode. |
| `2026-10-28-site-samples-light.png` | The samples gallery at the math sample, light: Markdown source next to the output, typeset by KaTeX auto-render. |
| `2026-10-28-site-samples-dark.png` | The same sample in dark mode. |
| `2026-10-28-site-plugins-light.png` | The plugins page, light: import, use, measured size, syntax, AST nodes and reference link of `mdlib-pure/gfm`. |
| `2026-10-28-site-plugins-dark.png` | The same plugins page in dark mode. |
| `2026-10-28-site-playground-light.png` | The playground, light: the demo editor's top bar and two panes, extended with a sample picker, plugin toggles, Share and Preview/HTML/AST tabs (GFM sample). |
| `2026-10-28-site-playground-dark.png` | The same playground in dark mode. |
| `2026-10-28-site-home-mobile.png` | The home page at 390 px wide, full page: menu button for the navigation, hero and live example stacked. |
| `2026-10-28-site-mermaid-light.png` | Samples page, Mermaid section, light: diagrams rendered by `renderMermaid()` with colors from the site's `--md-*` tokens. |
| `2026-10-28-site-mermaid-dark.png` | The same section after switching the site to dark: redrawn automatically from the dark tokens. |
| `2026-10-29-site-home.png` | The home page presenting the Web Components and the Blazor wrapper, light, full page: the datasheet's Output line names the elements and the Blazor wrapper, a new "Ways to use it" section has a snippet each for JavaScript, Web Components, React/Preact/Vue and Blazor (with the link to the GitHub release), and `mdlib-pure/element` appears in the plugins table with its measured size. |
| `2026-10-29-site-docs-elements.png` | The new "Web Components" docs page, rendered at build time from `docs/elements.md`, with both new pages in the sidebar. |
| `2026-10-29-site-docs-blazor.png` | The new "Blazor" docs page, rendered from `bindings/blazor/README.md`; the site's note above it links the `.nupkg` on the GitHub release, and C# and Razor blocks are highlighted. |
| `2026-10-29-site-samples-elements.png` | Samples page, the live Web Components sample after typing a line in Chromium: the HTML source above a real `<mdlib-markdown>` and `<mdlib-editor>`, KaTeX and Mermaid loaded from the site's own assets, and the count of the editor's debounced `input` events. |
