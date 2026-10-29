using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Microsoft.JSInterop;

namespace MdlibPure.Blazor;

/// <summary><see cref="IMarkdownService"/> over the JS isolation module <c>dist/mdlib-service.js</c>.</summary>
internal sealed class MarkdownService(IJSRuntime js, MdlibPureOptions options) : IMarkdownService, IAsyncDisposable
{
    internal const string ModulePath = "./_content/MdlibPure.Blazor/dist/mdlib-service.js";

    internal const string NotInteractiveMessage =
        "IMarkdownService needs JavaScript interop, which is not available here. In Static SSR there is no " +
        "browser connection, and a component being prerendered is not connected yet: call the service from an " +
        "interactive render mode (InteractiveServer, InteractiveWebAssembly or InteractiveAuto), in " +
        "OnAfterRenderAsync or an event handler. The Markdown and MarkdownEditor components work in every render " +
        "mode, Static SSR included; only this service needs interactivity.";

    private Task<IJSObjectReference>? _module;

    public Task<MarkdownNode> ParseAsync(string markdown, MarkdownPlugins plugins = MarkdownPlugins.None, string? config = null, CancellationToken cancellationToken = default) =>
        InvokeAsync("parse", MdlibJsonContext.Default.MarkdownNode, markdown, plugins, config, cancellationToken);

    public async Task<IReadOnlyList<TocEntry>> GetTocAsync(string markdown, MarkdownPlugins plugins = MarkdownPlugins.None, string? config = null, CancellationToken cancellationToken = default) =>
        await InvokeAsync("getToc", MdlibJsonContext.Default.TocEntryArray, markdown, plugins, config, cancellationToken);

    public Task<string> RenderHtmlAsync(string markdown, MarkdownPlugins plugins = MarkdownPlugins.None, string? config = null, CancellationToken cancellationToken = default) =>
        InvokeAsync("renderHtml", MdlibJsonContext.Default.String, markdown, plugins, config, cancellationToken);

    private async Task<T> InvokeAsync<T>(string function, JsonTypeInfo<T> type, string markdown, MarkdownPlugins plugins, string? config, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(markdown);
        var module = await GetModuleAsync();
        // Bytes, read as a stream: Interactive Server sends them in chunks, not as one
        // SignalR message (whose size is limited to 32 KB by default).
        var result = await module.InvokeAsync<IJSStreamReference>(function, cancellationToken, markdown, plugins.ToAttributeValue(), config ?? string.Empty);
        await using (result)
        {
            await using var stream = await result.OpenReadStreamAsync(options.MaxResultSize, cancellationToken);
            return await JsonSerializer.DeserializeAsync(stream, type, cancellationToken)
                ?? throw new InvalidOperationException($"mdlib-pure returned no result for {function}().");
        }
    }

    private async Task<IJSObjectReference> GetModuleAsync()
    {
        try
        {
            return await (_module ??= js.InvokeAsync<IJSObjectReference>("import", ModulePath).AsTask());
        }
        catch (InvalidOperationException e)
        {
            // Static rendering (UnsupportedJavaScriptRuntime) or prerendering: try again next time.
            _module = null;
            throw new InvalidOperationException(NotInteractiveMessage, e);
        }
        catch
        {
            _module = null;
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_module is { IsCompletedSuccessfully: true } module)
        {
            try
            {
                await module.Result.DisposeAsync();
            }
            catch (JSDisconnectedException)
            {
                // The circuit is gone (Interactive Server): nothing to release in the browser.
            }
        }
    }
}
