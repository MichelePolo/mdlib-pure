namespace MdlibPure.Blazor;

/// <summary>
/// The mdlib-pure plugins to enable. Combine flags (<c>Gfm | Math</c>) or use <see cref="All"/>.
/// <see cref="None"/> is plain CommonMark 0.31.2.
/// </summary>
[Flags]
public enum MarkdownPlugins
{
    /// <summary>CommonMark only.</summary>
    None = 0,

    /// <summary>GitHub Flavored Markdown: tables, strikethrough, autolinks, task lists, footnotes, alerts (<c>gfm</c>).</summary>
    Gfm = 1 << 0,

    /// <summary>GitHub-style heading ids, used by the table of contents (<c>headings</c>).</summary>
    Headings = 1 << 1,

    /// <summary><c>$inline$</c> and <c>$$display$$</c> math, typeset by KaTeX in the browser (<c>math</c>).</summary>
    Math = 1 << 2,

    /// <summary><c>```mermaid</c> diagrams, drawn by Mermaid in the browser (<c>mermaid</c>).</summary>
    Mermaid = 1 << 3,

    /// <summary>Fenced containers: <c>::: warning Title</c> … <c>:::</c> (<c>container</c>).</summary>
    Container = 1 << 4,

    /// <summary>Definition lists: <c>Term</c> / <c>: Definition</c> (<c>deflist</c>).</summary>
    DefinitionList = 1 << 5,

    /// <summary><c>==highlight==</c> → <c>&lt;mark&gt;</c> (<c>mark</c>).</summary>
    Mark = 1 << 6,

    /// <summary>YAML (<c>---</c>) and TOML (<c>+++</c>) front matter, kept out of the output (<c>frontmatter</c>).</summary>
    FrontMatter = 1 << 7,

    /// <summary>Every plugin above.</summary>
    All = Gfm | Headings | Math | Mermaid | Container | DefinitionList | Mark | FrontMatter,
}

/// <summary>Conversion of <see cref="MarkdownPlugins"/> to the elements' <c>plugins</c> attribute.</summary>
public static class MarkdownPluginsExtensions
{
    // In the order the element applies them (its order wins whatever the attribute order).
    private static readonly (MarkdownPlugins Flag, string Name)[] Names =
    [
        (MarkdownPlugins.Gfm, "gfm"),
        (MarkdownPlugins.Headings, "headings"),
        (MarkdownPlugins.Math, "math"),
        (MarkdownPlugins.Mermaid, "mermaid"),
        (MarkdownPlugins.Container, "container"),
        (MarkdownPlugins.DefinitionList, "deflist"),
        (MarkdownPlugins.Mark, "mark"),
        (MarkdownPlugins.FrontMatter, "frontmatter"),
    ];

    /// <summary>
    /// The value of the <c>plugins</c> attribute: <c>"all"</c>, space-separated names
    /// (<c>"gfm math"</c>), or <c>""</c> for <see cref="MarkdownPlugins.None"/>.
    /// </summary>
    public static string ToAttributeValue(this MarkdownPlugins plugins)
    {
        if ((plugins & MarkdownPlugins.All) == MarkdownPlugins.All)
        {
            return "all";
        }

        return string.Join(' ', Names.Where(n => (plugins & n.Flag) != 0).Select(n => n.Name));
    }
}
