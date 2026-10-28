# Development screenshots

Screenshots taken with Playwright (Chromium) while developing mdlib-pure.

| File | What it shows |
|---|---|
| `2026-10-28-demo-editor-light.png` | The first live editor (`demo/`), light theme: CommonMark + GFM (alert, task list, table, code, footnote) rendered with `theme.css`. Captured while checking the theme; it revealed a CSS source-order bug (top margin of the first heading, extra space under the alert) that was then fixed. |
| `2026-10-28-demo-editor-dark-full.png` | The same editor in dark mode, full page: neutral colors derive from `currentColor`, hues from `light-dark()`. |
