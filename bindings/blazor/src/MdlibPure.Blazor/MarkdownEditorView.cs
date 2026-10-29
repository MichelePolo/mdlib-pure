namespace MdlibPure.Blazor;

/// <summary>Panes shown by <see cref="MarkdownEditor"/> (the toolbar can switch them too).</summary>
public enum MarkdownEditorView
{
    /// <summary>Source and preview side by side (one above the other on narrow screens).</summary>
    Split,

    /// <summary>Source only.</summary>
    Write,

    /// <summary>Preview only.</summary>
    Preview,
}
