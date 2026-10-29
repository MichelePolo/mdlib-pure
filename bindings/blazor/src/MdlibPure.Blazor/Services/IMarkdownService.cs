namespace MdlibPure.Blazor;

/// <summary>
/// mdlib-pure from C#: AST, table of contents and HTML. Registered by
/// <c>builder.Services.AddMdlibPure()</c>.
/// </summary>
/// <remarks>
/// <para>
/// Markdown is processed by mdlib-pure in the user's browser, through JavaScript
/// interop: the service needs an interactive render mode (Interactive Server,
/// WebAssembly or Auto) and must be called once the component is interactive
/// (<c>OnAfterRenderAsync</c>, an event handler). In Static SSR, or while a
/// component is prerendered, it throws an <see cref="InvalidOperationException"/>.
/// </para>
/// <para>
/// Under Interactive Server the results are computed by the browser, so treat
/// them like any other client input: never store <see cref="RenderHtmlAsync"/>
/// output to serve it to other users; store the Markdown and render it on display.
/// </para>
/// </remarks>
public interface IMarkdownService
{
    /// <summary>Parses Markdown into its AST (an mdast-style tree; the root has type <c>root</c>).</summary>
    /// <param name="markdown">The Markdown source.</param>
    /// <param name="plugins">Plugins to enable, as for the components.</param>
    /// <param name="config">Name of options registered in JavaScript with <c>defineElements({ configs })</c>.</param>
    /// <param name="cancellationToken">Cancels the call.</param>
    Task<MarkdownNode> ParseAsync(string markdown, MarkdownPlugins plugins = MarkdownPlugins.None, string? config = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Headings with their ids, in document order. The headings plugin is always enabled
    /// for this call, so ids match a viewer that has <see cref="MarkdownPlugins.Headings"/>.
    /// </summary>
    /// <inheritdoc cref="ParseAsync" path="/param"/>
    Task<IReadOnlyList<TocEntry>> GetTocAsync(string markdown, MarkdownPlugins plugins = MarkdownPlugins.None, string? config = null, CancellationToken cancellationToken = default);

    /// <summary>
    /// Renders Markdown to an HTML string (raw HTML in the source is escaped, URLs follow
    /// the allowlist). Math and diagrams are left as markup for KaTeX and Mermaid
    /// (<c>\(…\)</c>, <c>&lt;pre class="mermaid"&gt;</c>): the elements typeset them, a plain string does not.
    /// </summary>
    /// <inheritdoc cref="ParseAsync" path="/param"/>
    Task<string> RenderHtmlAsync(string markdown, MarkdownPlugins plugins = MarkdownPlugins.None, string? config = null, CancellationToken cancellationToken = default);
}
