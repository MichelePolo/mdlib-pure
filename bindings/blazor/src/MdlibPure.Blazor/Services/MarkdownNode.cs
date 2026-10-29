using System.Text.Json;
using System.Text.Json.Serialization;

namespace MdlibPure.Blazor;

/// <summary>
/// A node of the mdlib-pure AST (mdast style). Node types and their properties are
/// listed in mdlib-pure's docs/api.md and in each plugin's header comment.
/// </summary>
/// <remarks>
/// Common types: <c>root</c>, <c>paragraph</c>, <c>heading</c> (<c>depth</c>, <c>id</c> with the headings
/// plugin), <c>text</c>, <c>emphasis</c>, <c>strong</c>, <c>link</c> (<c>url</c>, <c>title</c>), <c>image</c>
/// (<c>url</c>, <c>title</c>, <c>alt</c>), <c>code</c> (<c>lang</c>, <c>meta</c>), <c>inlineCode</c>, <c>list</c>
/// (<c>ordered</c>, <c>start</c>, <c>spread</c>), <c>listItem</c>, <c>blockquote</c>, <c>thematicBreak</c>,
/// <c>break</c>, <c>html</c>; plugins add <c>table</c>, <c>math</c>, <c>inlineMath</c>, <c>mermaid</c>,
/// <c>container</c>, <c>footnoteDefinition</c>… Soft line breaks are <c>\n</c> inside <c>text</c> values.
/// </remarks>
public sealed record MarkdownNode
{
    /// <summary>Node type, e.g. <c>heading</c>.</summary>
    public required string Type { get; init; }

    /// <summary>Literal content of leaf nodes (<c>text</c>, <c>code</c>, <c>inlineCode</c>, <c>math</c>…), else <c>null</c>.</summary>
    public string? Value { get; init; }

    /// <summary>Child nodes of parent nodes, else <c>null</c>.</summary>
    public IReadOnlyList<MarkdownNode>? Children { get; init; }

    /// <summary>Every other property of the node (<c>depth</c>, <c>url</c>, <c>lang</c>, <c>checked</c>…), as JSON.</summary>
    /// <remarks>Settable rather than init-only: System.Text.Json cannot fill init-only extension data.</remarks>
    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Properties { get; set; }

    /// <summary>The JSON value of property <paramref name="name"/>, if present.</summary>
    public bool TryGetProperty(string name, out JsonElement value)
    {
        if (Properties is not null && Properties.TryGetValue(name, out value))
        {
            return true;
        }

        value = default;
        return false;
    }

    /// <summary>A string property (<c>url</c>, <c>lang</c>, <c>id</c>…), or <c>null</c> if absent or not a string.</summary>
    public string? GetString(string name) =>
        TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    /// <summary>An integer property (<c>depth</c>, <c>start</c>…), or <c>null</c> if absent or not an integer.</summary>
    public int? GetInt32(string name) =>
        TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.Number && v.TryGetInt32(out var n) ? n : null;

    /// <summary>A boolean property (<c>ordered</c>, <c>spread</c>, <c>checked</c>…), or <c>null</c> if absent or not a boolean.</summary>
    public bool? GetBoolean(string name) =>
        TryGetProperty(name, out var v) && v.ValueKind is JsonValueKind.True or JsonValueKind.False ? v.GetBoolean() : null;

    /// <summary>All descendants, depth-first in document order (without this node).</summary>
    public IEnumerable<MarkdownNode> Descendants()
    {
        // Iterative: documents can nest about a hundred levels deep.
        var stack = new Stack<IEnumerator<MarkdownNode>>();
        if (Children is not null)
        {
            stack.Push(Children.GetEnumerator());
        }

        while (stack.Count > 0)
        {
            var top = stack.Peek();
            if (!top.MoveNext())
            {
                stack.Pop().Dispose();
                continue;
            }

            yield return top.Current;
            if (top.Current.Children is { Count: > 0 } children)
            {
                stack.Push(children.GetEnumerator());
            }
        }
    }

    /// <summary>This node, then all its descendants, depth-first in document order.</summary>
    public IEnumerable<MarkdownNode> DescendantsAndSelf() => Descendants().Prepend(this);

    /// <summary>The text a reader sees: literal values of all descendants (image alt texts excluded).</summary>
    public string TextContent() =>
        Value ?? string.Concat(DescendantsAndSelf().Where(n => n.Value is not null && n.Type != "html").Select(n => n.Value));
}
