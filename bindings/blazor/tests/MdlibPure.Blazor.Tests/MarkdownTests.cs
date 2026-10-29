namespace MdlibPure.Blazor.Tests;

public class MarkdownTests : BunitContext
{
    [Fact]
    public void Renders_an_empty_mdlib_markdown_element_with_the_source_attribute()
    {
        var cut = Render<Markdown>(ps => ps.Add(p => p.Value, "# Hello *world*"));

        cut.MarkupMatches("""<mdlib-markdown class="md" source="# Hello *world*" data-permanent></mdlib-markdown>""");
    }

    [Fact]
    public void Maps_plugins_config_class_and_extra_attributes()
    {
        var cut = Render<Markdown>(ps => ps
            .Add(p => p.Value, "x")
            .Add(p => p.Plugins, MarkdownPlugins.Gfm | MarkdownPlugins.Math)
            .Add(p => p.Config, "docs")
            .Add(p => p.Class, "prose wide")
            .AddUnmatched("id", "intro")
            .AddUnmatched("aria-label", "Notes"));

        var el = cut.Find("mdlib-markdown");
        Assert.Equal("md prose wide", el.GetAttribute("class"));
        Assert.Equal("gfm math", el.GetAttribute("plugins"));
        Assert.Equal("docs", el.GetAttribute("config"));
        Assert.Equal("intro", el.Id);
        Assert.Equal("Notes", el.GetAttribute("aria-label"));
        Assert.True(el.HasAttribute("data-permanent"));
        Assert.Empty(el.Children);
    }

    [Fact]
    public void No_plugins_and_no_config_render_no_attribute()
    {
        var el = Render<Markdown>(ps => ps.Add(p => p.Value, "x")).Find("mdlib-markdown");

        Assert.False(el.HasAttribute("plugins"));
        Assert.False(el.HasAttribute("config"));
    }

    [Fact]
    public void A_new_value_only_changes_the_attribute()
    {
        var cut = Render<Markdown>(ps => ps.Add(p => p.Value, "one"));

        cut.Render(ps => ps.Add(p => p.Value, "two"));

        Assert.Equal("two", cut.Find("mdlib-markdown").GetAttribute("source"));
    }

    [Fact]
    public void Markdown_is_never_rendered_on_the_server()
    {
        var cut = Render<Markdown>(ps => ps.Add(p => p.Value, "<script>alert(1)</script> **bold**"));

        // The source is only an attribute value: no element is created from it.
        Assert.Empty(cut.Find("mdlib-markdown").ChildNodes);
        Assert.Empty(cut.FindAll("script, strong"));
    }
}
