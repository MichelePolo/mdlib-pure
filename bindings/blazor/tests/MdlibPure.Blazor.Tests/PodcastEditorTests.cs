using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Web;

namespace MdlibPure.Blazor.Tests;

public class PodcastEditorTests : BunitContext
{
    [Fact]
    public void Serializes_the_whole_episode_and_configured_participants()
    {
        var value = new PodcastEpisode { Source = "@Vera [](time:5:00:00)", Documents = new() { ["Appunti"] = "<script> & notes" } };
        var cut = Render<PodcastEditor>(ps => ps.Add(p => p.Value, value).Add(p => p.Participants, ["Ari", "Bea"]).Add(p => p.Name, "episode"));
        var el = cut.Find("mdlib-podcast-editor");
        Assert.Equal(value.Source, PodcastEpisode.FromJson(el.GetAttribute("value")!).Source);
        Assert.Equal(value.Documents["Appunti"], PodcastEpisode.FromJson(el.GetAttribute("value")!).Documents["Appunti"]);
        Assert.Equal("[\"Ari\",\"Bea\"]", el.GetAttribute("participants"));
        Assert.Equal("episode", el.GetAttribute("name"));
        Assert.True(el.HasAttribute("data-permanent"));
    }

    [Fact]
    public void Input_updates_documents_active_tab_and_total_in_csharp()
    {
        PodcastEpisode? received = null;
        var cut = Render<PodcastEditor>(ps => ps.Add(p => p.Value, new()).Add(p => p.ValueChanged, (PodcastEpisode value) => received = value));
        cut.Find("mdlib-podcast-editor").Input(new ChangeEventArgs { Value = "{\"source\":\"[](time:5:00:00)\",\"documents\":{\"Appunti\":\"note\"},\"activeDocument\":\"Appunti\",\"durationCentiseconds\":30000}" });
        Assert.NotNull(received);
        Assert.Equal("note", received.Documents["Appunti"]);
        Assert.Equal("Appunti", received.ActiveDocument);
        Assert.Equal(TimeSpan.FromMinutes(5), received.PlannedDuration);
    }

    [Fact]
    public void Invalid_json_does_not_replace_the_bound_episode()
    {
        var changes = 0;
        var cut = Render<PodcastEditor>(ps => ps.Add(p => p.Value, new() { Source = "original" }).Add(p => p.ValueChanged, (PodcastEpisode _) => changes++));
        cut.Find("mdlib-podcast-editor").Input(new ChangeEventArgs { Value = "invalid JSON" });
        Assert.Equal(0, changes);
        Assert.NotNull(cut.Instance.Value);
        Assert.Equal("original", cut.Instance.Value.Source);
    }

    [Fact]
    public void Prerendered_interactive_editor_is_inert()
    {
        SetRendererInfo(new RendererInfo("Static", false));
        var cut = Render<PodcastEditor>(ps => ps.Add(p => p.Value, new()).SetAssignedRenderMode(RenderMode.InteractiveServer));
        Assert.True(cut.Find("mdlib-podcast-editor").HasAttribute("inert"));
        var ssr = Render<PodcastEditor>(ps => ps.Add(p => p.Value, new()));
        Assert.False(ssr.Find("mdlib-podcast-editor").HasAttribute("inert"));
    }
}
