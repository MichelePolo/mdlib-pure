using System.Text;
using Microsoft.JSInterop;

namespace MdlibPure.Blazor.Tests.Fakes;

/// <summary>
/// A browser stand-in: <c>import</c> returns a module whose functions return the
/// JSON bytes registered for them, as the real mdlib-service.js does.
/// </summary>
internal sealed class FakeJSRuntime : IJSRuntime
{
    public Dictionary<string, string> Results { get; } = [];

    public List<(string Identifier, object?[]? Args)> Calls { get; } = [];

    public int Imports { get; private set; }

    public bool ModuleDisposed { get; private set; }

    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args) =>
        InvokeAsync<TValue>(identifier, CancellationToken.None, args);

    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, CancellationToken cancellationToken, object?[]? args)
    {
        Assert.Equal("import", identifier);
        Imports++;
        return ValueTask.FromResult((TValue)(object)new Module(this));
    }

    private sealed class Module(FakeJSRuntime owner) : IJSObjectReference
    {
        public ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args) =>
            InvokeAsync<TValue>(identifier, CancellationToken.None, args);

        public ValueTask<TValue> InvokeAsync<TValue>(string identifier, CancellationToken cancellationToken, object?[]? args)
        {
            owner.Calls.Add((identifier, args));
            var json = owner.Results.TryGetValue(identifier, out var r) ? r : throw new JSException($"{identifier} is not a function");
            return ValueTask.FromResult((TValue)(object)new StreamReference(Encoding.UTF8.GetBytes(json)));
        }

        public ValueTask DisposeAsync()
        {
            owner.ModuleDisposed = true;
            return ValueTask.CompletedTask;
        }
    }

    private sealed class StreamReference(byte[] bytes) : IJSStreamReference
    {
        public long Length => bytes.Length;

        public ValueTask<Stream> OpenReadStreamAsync(long maxAllowedSize = 512000, CancellationToken cancellationToken = default) =>
            bytes.Length > maxAllowedSize
                ? throw new ArgumentOutOfRangeException(nameof(maxAllowedSize), $"{bytes.Length} > {maxAllowedSize}")
                : ValueTask.FromResult<Stream>(new MemoryStream(bytes));

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}

/// <summary>What JS interop does during Static SSR (UnsupportedJavaScriptRuntime) or prerendering.</summary>
internal sealed class StaticRenderingJSRuntime : IJSRuntime
{
    public const string Message =
        "JavaScript interop calls cannot be issued during server-side static rendering, because the page has not yet loaded in the browser.";

    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, object?[]? args) => throw new InvalidOperationException(Message);

    public ValueTask<TValue> InvokeAsync<TValue>(string identifier, CancellationToken cancellationToken, object?[]? args) => throw new InvalidOperationException(Message);
}
