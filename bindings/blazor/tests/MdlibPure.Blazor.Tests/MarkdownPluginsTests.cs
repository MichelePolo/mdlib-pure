namespace MdlibPure.Blazor.Tests;

public class MarkdownPluginsTests
{
    [Theory]
    [InlineData(MarkdownPlugins.None, "")]
    [InlineData(MarkdownPlugins.Gfm, "gfm")]
    [InlineData(MarkdownPlugins.Headings, "headings")]
    [InlineData(MarkdownPlugins.Math, "math")]
    [InlineData(MarkdownPlugins.Mermaid, "mermaid")]
    [InlineData(MarkdownPlugins.Container, "container")]
    [InlineData(MarkdownPlugins.DefinitionList, "deflist")]
    [InlineData(MarkdownPlugins.Mark, "mark")]
    [InlineData(MarkdownPlugins.FrontMatter, "frontmatter")]
    [InlineData(MarkdownPlugins.All, "all")]
    public void Each_flag_maps_to_the_element_plugin_name(MarkdownPlugins plugins, string expected) =>
        Assert.Equal(expected, plugins.ToAttributeValue());

    [Fact]
    public void Combinations_use_the_element_order_whatever_the_flag_order() =>
        Assert.Equal("gfm math mark frontmatter", (MarkdownPlugins.FrontMatter | MarkdownPlugins.Mark | MarkdownPlugins.Math | MarkdownPlugins.Gfm).ToAttributeValue());

    [Fact]
    public void All_but_one_is_listed_by_name() =>
        Assert.Equal("gfm headings math container deflist mark frontmatter", (MarkdownPlugins.All & ~MarkdownPlugins.Mermaid).ToAttributeValue());

    [Fact]
    public void Unknown_bits_are_ignored() =>
        Assert.Equal("gfm", ((MarkdownPlugins)(1 << 20) | MarkdownPlugins.Gfm).ToAttributeValue());

    [Fact]
    public void Every_named_flag_has_a_name()
    {
        foreach (var flag in Enum.GetValues<MarkdownPlugins>().Where(f => f is not MarkdownPlugins.None and not MarkdownPlugins.All))
        {
            Assert.Matches("^[a-z]+$", flag.ToAttributeValue());
        }
    }
}
