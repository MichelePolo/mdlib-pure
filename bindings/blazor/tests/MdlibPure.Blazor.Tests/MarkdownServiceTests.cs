using MdlibPure.Blazor.Tests.Fakes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.JSInterop;

namespace MdlibPure.Blazor.Tests;

public class MarkdownServiceTests
{
    // What mdlib-service.js returns for "# Intro\n\nSee [docs](https://example.com).\n\n## Next steps", with gfm + headings.
    private const string AstJson = """
        {"type":"root","children":[
          {"type":"heading","depth":1,"id":"intro","children":[{"type":"text","value":"Intro"}]},
          {"type":"paragraph","children":[{"type":"text","value":"See "},{"type":"link","url":"https://example.com","title":null,"children":[{"type":"text","value":"docs"}]},{"type":"text","value":"."}]},
          {"type":"heading","depth":2,"id":"next-steps","children":[{"type":"text","value":"Next steps"}]},
          {"type":"list","ordered":false,"start":null,"spread":false,"children":[{"type":"listItem","spread":false,"checked":true,"children":[{"type":"paragraph","children":[{"type":"text","value":"done"}]}]}]},
          {"type":"code","lang":"cs","meta":null,"value":"var x = 1;\n"}
        ]}
        """;

    private static (IMarkdownService Service, T Js, ServiceProvider Provider) Create<T>(T js, Action<MdlibPureOptions>? configure = null)
        where T : class, IJSRuntime
    {
        var provider = new ServiceCollection().AddSingleton<IJSRuntime>(js).AddMdlibPure(configure).BuildServiceProvider();
        return (provider.CreateScope().ServiceProvider.GetRequiredService<IMarkdownService>(), js, provider);
    }

    [Fact]
    public async Task ParseAsync_returns_a_typed_ast()
    {
        var (service, js, _) = Create(new FakeJSRuntime { Results = { ["parse"] = AstJson } });

        var root = await service.ParseAsync("# Intro", MarkdownPlugins.Gfm | MarkdownPlugins.Headings);

        Assert.Equal("root", root.Type);
        Assert.Equal(5, root.Children!.Count);
        var heading = root.Children[0];
        Assert.Equal("heading", heading.Type);
        Assert.Equal(1, heading.GetInt32("depth"));
        Assert.Equal("intro", heading.GetString("id"));
        Assert.Equal("Intro", heading.TextContent());
        var link = root.Children[1].Children![1];
        Assert.Equal("https://example.com", link.GetString("url"));
        Assert.Null(link.GetString("title"));
        Assert.True(link.TryGetProperty("title", out var title) && title.ValueKind == System.Text.Json.JsonValueKind.Null);
        Assert.False(root.Children[3].GetBoolean("ordered"));
        Assert.True(root.Children[3].Children![0].GetBoolean("checked"));
        Assert.Equal("var x = 1;\n", root.Children[4].Value);
        Assert.Equal("cs", root.Children[4].GetString("lang"));
        Assert.Null(root.Children[4].Children);
    }

    [Fact]
    public async Task ParseAsync_passes_markdown_plugins_and_config_to_the_module()
    {
        var (service, js, _) = Create(new FakeJSRuntime { Results = { ["parse"] = AstJson } });

        await service.ParseAsync("# Intro", MarkdownPlugins.Gfm | MarkdownPlugins.Math, "docs");
        await service.ParseAsync("x");

        Assert.Equal(1, js.Imports);
        Assert.Equal(["# Intro", "gfm math", "docs"], js.Calls[0].Args!);
        Assert.Equal(["x", "", ""], js.Calls[1].Args!);
    }

    [Fact]
    public async Task The_ast_can_be_walked_without_recursion()
    {
        var (service, _, _) = Create(new FakeJSRuntime { Results = { ["parse"] = AstJson } });
        var root = await service.ParseAsync("…");

        var types = root.DescendantsAndSelf().Select(n => n.Type).ToList();

        Assert.Equal(15, types.Count);
        Assert.Equal(["root", "heading", "text", "paragraph", "text", "link", "text", "text", "heading", "text", "list"], types.Take(11));
        Assert.Equal(["Intro", "Next steps"], root.Descendants().Where(n => n.Type == "heading").Select(n => n.TextContent()));
    }

    [Fact]
    public async Task Deep_documents_deserialize()
    {
        // mdlib-pure caps nesting at about a hundred levels: two JSON levels each.
        var json = string.Concat(Enumerable.Repeat("""{"type":"blockquote","children":[""", 120)) + """{"type":"text","value":"deep"}""" + string.Concat(Enumerable.Repeat("]}", 120));
        var (service, _, _) = Create(new FakeJSRuntime { Results = { ["parse"] = json } });

        var root = await service.ParseAsync("> > > …");

        Assert.Equal("deep", root.TextContent());
        Assert.Equal(121, root.DescendantsAndSelf().Count());
    }

    [Fact]
    public async Task GetTocAsync_returns_headings()
    {
        var (service, js, _) = Create(new FakeJSRuntime
        {
            Results = { ["getToc"] = """[{"depth":1,"id":"intro","text":"Intro"},{"depth":2,"id":"next-steps","text":"Next steps"}]""" },
        });

        var toc = await service.GetTocAsync("# Intro\n## Next steps", MarkdownPlugins.Gfm);

        Assert.Equal([new TocEntry(1, "intro", "Intro"), new TocEntry(2, "next-steps", "Next steps")], toc);
        Assert.Equal("getToc", js.Calls[0].Identifier);
        Assert.Equal("gfm", js.Calls[0].Args![1]);
    }

    [Fact]
    public async Task RenderHtmlAsync_returns_the_html_string()
    {
        var (service, js, _) = Create(new FakeJSRuntime { Results = { ["renderHtml"] = "\"<h1>Intro</h1>\\n\"" } });

        var html = await service.RenderHtmlAsync("# Intro");

        Assert.Equal("<h1>Intro</h1>\n", html);
        Assert.Equal("renderHtml", js.Calls[0].Identifier);
    }

    [Fact]
    public async Task Results_larger_than_the_limit_are_refused()
    {
        var (service, _, _) = Create(new FakeJSRuntime { Results = { ["parse"] = AstJson } }, o => o.MaxResultSize = 64);

        await Assert.ThrowsAsync<ArgumentOutOfRangeException>(() => service.ParseAsync("# Intro"));
    }

    [Fact]
    public async Task Static_ssr_explains_that_an_interactive_render_mode_is_needed()
    {
        var (service, _, _) = Create(new StaticRenderingJSRuntime());

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => service.ParseAsync("# Intro"));

        Assert.Equal(MarkdownService.NotInteractiveMessage, e.Message);
        Assert.Contains("interactive render mode", e.Message);
        Assert.Contains("OnAfterRenderAsync", e.Message);
        Assert.Equal(StaticRenderingJSRuntime.Message, e.InnerException!.Message);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetTocAsync("# Intro"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.RenderHtmlAsync("# Intro"));
    }

    [Fact]
    public async Task Javascript_errors_are_not_mistaken_for_static_rendering()
    {
        var (service, _, _) = Create(new FakeJSRuntime());

        await Assert.ThrowsAsync<JSException>(() => service.ParseAsync("# Intro"));
    }

    [Fact]
    public async Task Null_markdown_is_rejected()
    {
        var (service, _, _) = Create(new FakeJSRuntime());

        await Assert.ThrowsAsync<ArgumentNullException>(() => service.ParseAsync(null!));
    }

    [Fact]
    public async Task Disposing_the_scope_releases_the_module()
    {
        var js = new FakeJSRuntime { Results = { ["parse"] = AstJson } };
        var provider = new ServiceCollection().AddSingleton<IJSRuntime>(js).AddMdlibPure().BuildServiceProvider();
        var scope = provider.CreateAsyncScope();
        await scope.ServiceProvider.GetRequiredService<IMarkdownService>().ParseAsync("x");

        await scope.DisposeAsync();

        Assert.True(js.ModuleDisposed);
    }

    [Fact]
    public void AddMdlibPure_registers_a_scoped_service_once()
    {
        var services = new ServiceCollection().AddMdlibPure(o => o.MaxResultSize = 1).AddMdlibPure();

        Assert.Single(services, d => d.ServiceType == typeof(IMarkdownService) && d.Lifetime == ServiceLifetime.Scoped);
        Assert.Equal(1, services.BuildServiceProvider().GetRequiredService<MdlibPureOptions>().MaxResultSize);
    }
}
