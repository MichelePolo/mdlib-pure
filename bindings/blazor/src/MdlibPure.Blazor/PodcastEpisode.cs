using System.Text.Json;
using System.Text.Json.Serialization;

namespace MdlibPure.Blazor;

/// <summary>The complete editable episode, including its separate supporting documents.</summary>
public sealed record PodcastEpisode
{
    /// <summary>Main rundown in Markdown. Its time tags determine the planned duration.</summary>
    public string Source { get; init; } = "";

    /// <summary>Supporting Markdown documents keyed by name. "Scaletta" is reserved.</summary>
    public Dictionary<string, string> Documents { get; init; } = new(StringComparer.Ordinal);

    /// <summary>Open document; "Scaletta" selects the main rundown.</summary>
    public string ActiveDocument { get; init; } = "Scaletta";

    /// <summary>Sum of recognized time tags in Source, updated by the browser. Supporting documents are excluded.</summary>
    public long DurationCentiseconds { get; init; }

    /// <summary>Planned duration as a .NET time span.</summary>
    [JsonIgnore]
    public TimeSpan PlannedDuration => TimeSpan.FromMilliseconds(DurationCentiseconds * 10d);

    /// <summary>Serialize for storage or a Static SSR form value, without reflection.</summary>
    public string ToJson() => JsonSerializer.Serialize(this, PodcastJsonContext.Default.PodcastEpisode);

    /// <summary>Read a saved episode or Static SSR form value. Throws JsonException for malformed JSON.</summary>
    public static PodcastEpisode FromJson(string json) => JsonSerializer.Deserialize(json, PodcastJsonContext.Default.PodcastEpisode)
        ?? throw new JsonException("An episode must be a JSON object.");
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(PodcastEpisode))]
[JsonSerializable(typeof(string[]))]
internal partial class PodcastJsonContext : JsonSerializerContext;
