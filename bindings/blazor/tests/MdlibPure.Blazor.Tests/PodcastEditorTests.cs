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
    public void Change_raises_OnValueCommit_with_the_episode()
    {
        PodcastEpisode? committed = null;
        var cut = Render<PodcastEditor>(ps => ps.Add(p => p.Value, new() { Source = "original" }).Add(p => p.OnValueCommit, (PodcastEpisode e) => committed = e));
        cut.Find("mdlib-podcast-editor").Change(new ChangeEventArgs { Value = "{\"source\":\"left\",\"durationCentiseconds\":100}" });
        Assert.NotNull(committed);
        Assert.Equal("left", committed.Source);
        Assert.Equal(100, committed.DurationCentiseconds);

        // Malformed JSON: the current episode.
        cut.Find("mdlib-podcast-editor").Change(new ChangeEventArgs { Value = "invalid JSON" });
        Assert.Equal("original", committed.Source);
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

    [Fact]
    public void Hosting_options_become_attributes_of_the_element()
    {
        var grammar = new PodcastGrammar { Durations = PodcastDurations.Clock, LineBlocks = true, LooseTasks = true, Tags = new() { Mentions = PodcastMentions.Any, Hashtags = true } };
        var cut = Render<PodcastEditor>(ps => ps.Add(p => p.Value, new()).Add(p => p.Grammar, grammar).Add(p => p.TagColors, new Dictionary<string, string> { ["campa"] = "#123456" })
            .Add(p => p.Tasks, PodcastTaskMode.Notify).Add(p => p.Documents, PodcastDocumentMode.Host).Add(p => p.ReadOnly, true).Add(p => p.Compact, true)
            .Add(p => p.CurrentLine, 3).Add(p => p.RunningTimer, (3, 1)).Add(p => p.Sounds, new[] { "Sigla", "Risata" }));
        var el = cut.Find("mdlib-podcast-editor");
        Assert.Equal("[\"Sigla\",\"Risata\"]", el.GetAttribute("sounds"));
        Assert.Equal("{\"durations\":\"Clock\",\"tags\":{\"mentions\":\"Any\",\"hashtags\":true},\"lineBlocks\":true,\"looseTasks\":true}", el.GetAttribute("grammar"));
        Assert.Equal("{\"campa\":\"#123456\"}", el.GetAttribute("tag-colors"));
        Assert.Equal("notify", el.GetAttribute("tasks"));
        Assert.Equal("host", el.GetAttribute("documents"));
        Assert.True(el.HasAttribute("readonly"));
        Assert.True(el.HasAttribute("compact"));
        Assert.Equal("3", el.GetAttribute("current-line"));
        Assert.Equal("3:1", el.GetAttribute("running-timer"));
        var plain = Render<PodcastEditor>(ps => ps.Add(p => p.Value, new())).Find("mdlib-podcast-editor");
        foreach (var name in new[] { "grammar", "tag-colors", "tasks", "documents", "readonly", "compact", "current-line", "running-timer", "sounds" }) Assert.False(plain.HasAttribute(name), name);
    }

    [Fact]
    public async Task Custom_events_reach_the_callbacks()
    {
        PodcastTaskEventArgs? task = null; PodcastDocumentEventArgs? document = null; PodcastSoundEventArgs? sound = null; string? active = null;
        var cut = Render<PodcastEditor>(ps => ps.Add(p => p.Value, new()).Add(p => p.Tasks, PodcastTaskMode.Notify)
            .Add(p => p.OnTaskToggle, (PodcastTaskEventArgs e) => task = e).Add(p => p.OnOpenDocument, (PodcastDocumentEventArgs e) => document = e).Add(p => p.OnActiveDocumentChanged, (string name) => active = name)
            .Add(p => p.OnPlaySound, (PodcastSoundEventArgs e) => sound = e));
        var el = cut.Find("mdlib-podcast-editor");
        await el.TriggerEventAsync("onpodcasttask", new PodcastTaskEventArgs { Document = "Scaletta", Id = 2, Checked = true, Line = 4, Box = 1 });
        await el.TriggerEventAsync("onpodcastdocument", new PodcastDocumentEventArgs { Name = "Scheda ospite.md", Title = "Scheda ospite" });
        await el.TriggerEventAsync("onpodcastsound", new PodcastSoundEventArgs { Name = "Sigla finale", Title = "Sigla" });
        await el.TriggerEventAsync("onpodcastactive", new PodcastActiveEventArgs { Name = "Appunti" });
        Assert.NotNull(task);
        Assert.Equal((2, true, 4, 1), (task.Id, task.Checked, task.Line, task.Box));
        Assert.Equal("Scheda ospite.md", document?.Name);
        Assert.Equal(("Sigla finale", "Sigla"), (sound?.Name, sound?.Title));
        Assert.Equal("Appunti", active);
    }
}
