using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;
using MdlibPure.Blazor.Tests.Hosts;

namespace MdlibPure.Blazor.Tests;

public class MarkdownEditorTests : BunitContext
{
    [Fact]
    public void Renders_the_element_with_its_attributes()
    {
        var value = "# Draft";
        var cut = Render<MarkdownEditor>(ps => ps
            .Add(p => p.Value, value)
            .Add(p => p.ValueExpression, () => value)
            .Add(p => p.Plugins, MarkdownPlugins.All)
            .Add(p => p.Config, "docs")
            .Add(p => p.View, MarkdownEditorView.Preview)
            .Add(p => p.Delay, 350)
            .Add(p => p.Label, "Body")
            .Add(p => p.Name, "body")
            .Add(p => p.Class, "tall")
            .Add(p => p.Style, "block-size: 30rem")
            .AddUnmatched("id", "editor"));

        cut.MarkupMatches("""
            <mdlib-editor id="editor" class="tall" style="block-size: 30rem" value="# Draft" plugins="all" config="docs"
                          view="preview" delay="350" label="Body" name="body" data-permanent></mdlib-editor>
            """);
    }

    [Theory]
    [InlineData(MarkdownEditorView.Split, "split")]
    [InlineData(MarkdownEditorView.Write, "write")]
    [InlineData(MarkdownEditorView.Preview, "preview")]
    public void View_maps_to_the_view_attribute(MarkdownEditorView view, string expected)
    {
        var cut = Render<MarkdownEditor>(ps => ps.Add(p => p.Value, "").Add(p => p.View, view));

        Assert.Equal(expected, cut.Find("mdlib-editor").GetAttribute("view"));
    }

    [Fact]
    public void Optional_attributes_are_omitted_by_default()
    {
        var el = Render<MarkdownEditor>(ps => ps.Add(p => p.Value, "x")).Find("mdlib-editor");

        foreach (var name in new[] { "plugins", "config", "delay", "label", "name", "class", "style", "inert" })
        {
            Assert.False(el.HasAttribute(name), name);
        }
        Assert.Equal("split", el.GetAttribute("view"));
    }

    [Fact]
    public void Bind_value_follows_the_elements_input_event()
    {
        var host = Render<BindingHost>();

        // What the element dispatches after the typing pause: event.target.value.
        host.Find("mdlib-editor").Input(new ChangeEventArgs { Value = "# Start, edited" });

        Assert.Equal("# Start, edited", host.Instance.Text);
        Assert.Equal("# Start, edited", host.Find("#echo").TextContent);
        Assert.Equal("# Start, edited", host.Find("mdlib-editor").GetAttribute("value"));
    }

    [Fact]
    public void Changing_the_bound_value_in_csharp_updates_the_value_attribute()
    {
        var host = Render<BindingHost>();

        host.Render(ps => ps.Add(p => p.Text, "Reset"));

        Assert.Equal("Reset", host.Find("mdlib-editor").GetAttribute("value"));
    }

    [Fact]
    public void An_input_with_the_same_value_does_not_notify_the_parent()
    {
        var host = Render<BindingHost>();
        var changes = host.Instance.Changes;

        host.Find("mdlib-editor").Input(new ChangeEventArgs { Value = "# Start" });

        Assert.Equal(changes, host.Instance.Changes);
    }

    [Fact]
    public void Value_changed_without_bind_works_too()
    {
        string? received = null;
        var cut = Render<MarkdownEditor>(ps => ps
            .Add(p => p.Value, "a")
            .Add(p => p.ValueChanged, (string? v) => received = v));

        cut.Find("mdlib-editor").Input(new ChangeEventArgs { Value = "ab" });

        Assert.Equal("ab", received);
    }

    [Fact]
    public void Value_alone_with_a_name_needs_no_binding()
    {
        // A plain Static SSR form: <MarkdownEditor Value="@Body" Name="body" />.
        var cut = Render<MarkdownEditor>(ps => ps.Add(p => p.Value, "text").Add(p => p.Name, "body"));

        Assert.Equal("body", cut.Find("mdlib-editor").GetAttribute("name"));
        Assert.Equal("text", cut.Find("mdlib-editor").GetAttribute("value"));
    }

    [Fact]
    public void Inside_an_edit_form_it_notifies_the_edit_context_and_gets_validation_classes()
    {
        var host = Render<EditFormHost>();
        var field = host.Instance.Context.Field(nameof(EditFormHost.DocumentModel.Body));
        Assert.Equal("valid", host.Find("mdlib-editor").GetAttribute("class"));

        host.Find("mdlib-editor").Input(new ChangeEventArgs { Value = "Changed" });

        Assert.Equal("Changed", host.Instance.Model.Body);
        Assert.True(host.Instance.Context.IsModified(field));
        Assert.Equal("modified valid", host.Find("mdlib-editor").GetAttribute("class"));
    }

    [Fact]
    public void Inside_an_edit_form_the_field_name_comes_from_the_bound_expression()
    {
        // As InputText does: a Static SSR form posts the value under the model's name.
        var host = Render<EditFormHost>();

        Assert.Equal("Model.Body", host.Find("mdlib-editor").GetAttribute("name"));
    }

    [Fact]
    public async Task Inside_an_edit_form_validation_marks_it_invalid()
    {
        var host = Render<EditFormHost>();

        host.Find("mdlib-editor").Input(new ChangeEventArgs { Value = "" });
        await host.InvokeAsync(() => host.Instance.Context.Validate());

        var el = host.Find("mdlib-editor");
        Assert.Contains("invalid", el.GetAttribute("class")!.Split(' '));
        Assert.Equal("true", el.GetAttribute("aria-invalid"));
    }

    [Fact]
    public void While_prerendering_an_interactive_component_the_editor_is_inert()
    {
        SetRendererInfo(new RendererInfo("Static", isInteractive: false));

        var cut = Render<MarkdownEditor>(ps => ps.Add(p => p.Value, "x").SetAssignedRenderMode(RenderMode.InteractiveServer));

        Assert.True(cut.Find("mdlib-editor").HasAttribute("inert"));
    }

    [Fact]
    public void Once_interactive_the_editor_is_not_inert()
    {
        SetRendererInfo(new RendererInfo("Server", isInteractive: true));

        var cut = Render<MarkdownEditor>(ps => ps.Add(p => p.Value, "x").SetAssignedRenderMode(RenderMode.InteractiveServer));

        Assert.False(cut.Find("mdlib-editor").HasAttribute("inert"));
    }

    [Fact]
    public void Static_ssr_is_never_inert_the_editor_works_without_interactivity()
    {
        SetRendererInfo(new RendererInfo("Static", isInteractive: false));

        var cut = Render<MarkdownEditor>(ps => ps.Add(p => p.Value, "x"));

        Assert.False(cut.Find("mdlib-editor").HasAttribute("inert"));
    }

    [Fact]
    public void Inert_while_prerendering_can_be_turned_off()
    {
        SetRendererInfo(new RendererInfo("Static", isInteractive: false));

        var cut = Render<MarkdownEditor>(ps => ps
            .Add(p => p.Value, "x")
            .Add(p => p.InertUntilInteractive, false)
            .SetAssignedRenderMode(RenderMode.InteractiveWebAssembly));

        Assert.False(cut.Find("mdlib-editor").HasAttribute("inert"));
    }
}
