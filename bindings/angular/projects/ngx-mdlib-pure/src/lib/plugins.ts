/** A first-party plugin of mdlib-pure, as named by the elements' `plugins` attribute. */
export type MarkdownPluginName = 'gfm' | 'headings' | 'math' | 'mermaid' | 'container' | 'deflist' | 'mark' | 'frontmatter'

/**
 * Plugins of a viewer, an editor or a `MarkdownService` call: `'all'`, one
 * name, or a list of names. Empty, `null` or `undefined` is plain CommonMark.
 */
export type MarkdownPlugins = 'all' | MarkdownPluginName | readonly MarkdownPluginName[]

/** Every plugin name, in the order mdlib-pure applies them (whatever the order you list them in). */
export const MARKDOWN_PLUGINS: readonly MarkdownPluginName[] = ['gfm', 'headings', 'math', 'mermaid', 'container', 'deflist', 'mark', 'frontmatter']

/** The elements' `plugins` attribute for a `MarkdownPlugins` value (`null`: no attribute). */
export function pluginsAttribute(plugins: MarkdownPlugins | null | undefined): string | null {
  if (!plugins) return null
  if (typeof plugins === 'string') return plugins
  return plugins.length ? plugins.join(' ') : null
}

/** View of the editor: source and preview side by side, source only, preview only. */
export type MarkdownEditorView = 'split' | 'write' | 'preview'
