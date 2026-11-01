namespace MdlibPure.Blazor;

/// <summary>How time values read in <c>[titolo](time:…)</c>.</summary>
public enum PodcastDurations
{
    /// <summary><c>M:SS</c> or <c>M:SS:CC</c>, the sample's form (default).</summary>
    Centiseconds,
    /// <summary><c>m:ss</c>, <c>h:mm:ss</c>, <c>5m</c>, <c>90s</c>, <c>2m30s</c> (1 s to 10 h); the chip shows a clock.</summary>
    Clock,
}

/// <summary>Which <c>@names</c> become badges.</summary>
public enum PodcastMentions
{
    /// <summary>Only the configured participants (default).</summary>
    Participants,
    /// <summary>Every <c>@name</c>, coloured from a hash of the name or from <see cref="PodcastEditor.TagColors"/>.</summary>
    Any,
}

/// <summary>Tag options of the podcast grammar.</summary>
public sealed record PodcastTagGrammar
{
    /// <summary>Which <c>@names</c> become badges.</summary>
    public PodcastMentions Mentions { get; init; } = PodcastMentions.Participants;
    /// <summary>Recognize <c>#topic</c> tags, coloured like <c>@names</c>.</summary>
    public bool Hashtags { get; init; }
}

/// <summary>
/// Options of the podcast plugin, fixed when the editor connects. The defaults are the sample's grammar;
/// an application whose rundowns use the richer forms turns them on here.
/// </summary>
public sealed record PodcastGrammar
{
    /// <summary>How time values read.</summary>
    public PodcastDurations Durations { get; init; } = PodcastDurations.Centiseconds;
    /// <summary>Mentions and hashtags.</summary>
    public PodcastTagGrammar Tags { get; init; } = new();
    /// <summary>One source line = one block: soft line breaks split paragraphs; setext headings and indented code are off.</summary>
    public bool LineBlocks { get; init; }
    /// <summary>Also accept <c>[]</c>, <c>[ x ]</c>, a box without a following space and glued list markers (<c>-[]</c>).</summary>
    public bool LooseTasks { get; init; }
}
