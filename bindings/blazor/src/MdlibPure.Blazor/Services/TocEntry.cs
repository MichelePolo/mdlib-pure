namespace MdlibPure.Blazor;

/// <summary>A heading of the table of contents.</summary>
/// <param name="Depth">Heading level, 1 to 6.</param>
/// <param name="Id">The heading's id (<c>#</c> anchor), GitHub style.</param>
/// <param name="Text">The heading's text.</param>
public sealed record TocEntry(int Depth, string Id, string Text);
