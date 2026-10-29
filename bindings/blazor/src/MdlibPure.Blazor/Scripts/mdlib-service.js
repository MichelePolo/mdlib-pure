// The JS isolation module behind IMarkdownService (MarkdownService.cs).
// Bundled by scripts/build-blazor-assets.js into wwwroot/dist/mdlib-service.js,
// sharing a chunk with mdlib-element.js: one getMarkdown(), so the `configs`
// registered with defineElements() apply here too.
//
// Results are returned as UTF-8 JSON bytes: .NET reads them as an
// IJSStreamReference, which Interactive Server streams in chunks instead of
// one SignalR message (32 KB limit by default).
import { getMarkdown } from '../../../../../src/element.ts'
import { toc } from '../../../../../src/plugins/headings.ts'

const encoder = new TextEncoder()
const bytes = (value) => encoder.encode(JSON.stringify(value))

/** Markdown -> AST (mdast-style root node). */
export function parse(source, plugins, config) {
  return bytes(getMarkdown(plugins, config).parse(source ?? ''))
}

/** Headings with ids: [{ depth, id, text }]. The headings plugin is always on here. */
export function getToc(source, plugins, config) {
  return bytes(toc(getMarkdown(`${plugins} headings`, config).parse(source ?? '')))
}

/** Markdown -> HTML string (same output as <mdlib-markdown>). */
export function renderHtml(source, plugins, config) {
  return bytes(getMarkdown(plugins, config).render(source ?? ''))
}
