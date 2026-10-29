using MdlibPure.Blazor.Demo.Components;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents()
    // The editor sends the whole document on each (debounced) input event. SignalR
    // limits incoming messages to 32 KB by default: raise it for long documents.
    .AddHubOptions(options => options.MaximumReceiveMessageSize = 1024 * 1024)
    .AddInteractiveWebAssemblyComponents();

// IMarkdownService (AST, table of contents, HTML). Also registered in the client's Program.cs.
builder.Services.AddMdlibPure();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseWebAssemblyDebugging();
}
else
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);

app.UseAntiforgery();

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode()
    .AddInteractiveWebAssemblyRenderMode()
    .AddAdditionalAssemblies(typeof(MdlibPure.Blazor.Demo.Client.Samples).Assembly);

app.Run();
