using Microsoft.AspNetCore.Components.WebAssembly.Hosting;

var builder = WebAssemblyHostBuilder.CreateDefault(args);

// IMarkdownService for components running in WebAssembly (Interactive WebAssembly and Auto).
builder.Services.AddMdlibPure();

await builder.Build().RunAsync();
