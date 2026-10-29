/*
 * ngx-mdlib-pure: Angular components over mdlib-pure's Web Components.
 *
 *   provideMdlibPure({ loaders, configs })   app.config.ts: defines the elements (browser only)
 *   MarkdownEditor   <mdlib-editor [(value)]>, ControlValueAccessor (ngModel, reactive forms)
 *   MarkdownViewer   <mdlib-markdown [source]>
 *   MarkdownService  parse(), toc(), render(): browser and server
 */
export { MarkdownEditor, type MdlibEditorElement } from './lib/markdown-editor'
export { MarkdownViewer, type MdlibElement } from './lib/markdown-viewer'
export { MarkdownService } from './lib/markdown.service'
export { MARKDOWN_PLUGINS, type MarkdownEditorView, type MarkdownPluginName, type MarkdownPlugins, pluginsAttribute } from './lib/plugins'
export { type MdlibPureOptions, provideMdlibPure } from './lib/provide'
export type { TocEntry } from 'mdlib-pure/headings'
