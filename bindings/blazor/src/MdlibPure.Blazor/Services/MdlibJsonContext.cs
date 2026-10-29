using System.Text.Json.Serialization;

namespace MdlibPure.Blazor;

// Source-generated (trimming and AOT safe). The AST nests up to about a hundred
// levels (mdlib-pure caps nesting), two JSON levels each.
[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, PropertyNameCaseInsensitive = true, MaxDepth = 512)]
[JsonSerializable(typeof(MarkdownNode))]
[JsonSerializable(typeof(TocEntry[]))]
[JsonSerializable(typeof(string))]
internal sealed partial class MdlibJsonContext : JsonSerializerContext;
