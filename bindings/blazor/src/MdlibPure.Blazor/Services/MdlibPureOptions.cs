namespace MdlibPure.Blazor;

/// <summary>Options of <see cref="IMarkdownService"/>, set with <c>AddMdlibPure(o => …)</c>.</summary>
public sealed class MdlibPureOptions
{
    /// <summary>
    /// Largest result (UTF-8 JSON) accepted from the browser, in bytes. Default 16 MB.
    /// An AST is about ten times the size of its Markdown.
    /// </summary>
    public long MaxResultSize { get; set; } = 16 * 1024 * 1024;
}
