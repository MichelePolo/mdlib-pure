using MdlibPure.Blazor;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>Registration of the MdlibPure.Blazor services.</summary>
public static class MdlibPureServiceCollectionExtensions
{
    /// <summary>
    /// Registers <see cref="IMarkdownService"/> (scoped: one per circuit on the server, one per app in WebAssembly).
    /// Call it in the server's Program.cs and, with WebAssembly or Auto, in the client's too.
    /// The components need no registration.
    /// </summary>
    public static IServiceCollection AddMdlibPure(this IServiceCollection services, Action<MdlibPureOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        var options = new MdlibPureOptions();
        configure?.Invoke(options);
        services.TryAddSingleton(options);
        services.TryAddScoped<IMarkdownService, MarkdownService>();
        return services;
    }
}
