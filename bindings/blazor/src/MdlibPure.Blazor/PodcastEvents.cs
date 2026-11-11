using Microsoft.AspNetCore.Components;

namespace MdlibPure.Blazor;

/// <summary>
/// Custom DOM events of <c>&lt;mdlib-podcast-editor&gt;</c>, mapped for Razor by the JS initializer
/// (<c>Blazor.registerCustomEventType</c>): <c>podcast-task</c>, <c>podcast-document</c>, <c>podcast-sound</c>, <c>podcast-active</c>.
/// </summary>
[EventHandler("onpodcasttask", typeof(PodcastTaskEventArgs), enableStopPropagation: true, enablePreventDefault: true)]
[EventHandler("onpodcastdocument", typeof(PodcastDocumentEventArgs), enableStopPropagation: true, enablePreventDefault: true)]
[EventHandler("onpodcastsound", typeof(PodcastSoundEventArgs), enableStopPropagation: true, enablePreventDefault: true)]
[EventHandler("onpodcastactive", typeof(PodcastActiveEventArgs), enableStopPropagation: true, enablePreventDefault: true)]
public static class EventHandlers;

/// <summary>A checkbox was clicked in the preview while <see cref="PodcastTaskMode.Notify"/> is on: the source was not changed.</summary>
public sealed class PodcastTaskEventArgs : EventArgs
{
    /// <summary>Name of the document holding the checkbox ("Scaletta" for the main rundown).</summary>
    public string Document { get; set; } = "";
    /// <summary>Ordinal of the checkbox in the document.</summary>
    public int Id { get; set; }
    /// <summary>The state the user asked for.</summary>
    public bool Checked { get; set; }
    /// <summary>Source line of the checkbox, 0-based.</summary>
    public int Line { get; set; }
    /// <summary>Ordinal of the checkbox on its line, 0-based.</summary>
    public int Box { get; set; }
}

/// <summary>A document button was clicked while <see cref="PodcastDocumentMode.Host"/> is on: nothing was opened.</summary>
public sealed class PodcastDocumentEventArgs : EventArgs
{
    /// <summary>Document name as written in the link (<c>[titolo](doc:name)</c> or <c>[scheda](name)</c>).</summary>
    public string Name { get; set; } = "";
    /// <summary>Visible title of the link (the name when the link has no title).</summary>
    public string Title { get; set; } = "";
}

/// <summary>A sound button (<c>[titolo](sound:nome)</c>) was clicked: the host plays that item of its soundboard. Buttons whose name is not in <c>Sounds</c> are disabled and never raise it.</summary>
public sealed class PodcastSoundEventArgs : EventArgs
{
    /// <summary>Name of the soundboard item as written in the link.</summary>
    public string Name { get; set; } = "";
    /// <summary>Visible title of the link (the name when the link has no title).</summary>
    public string Title { get; set; } = "";
}

/// <summary>The editor switched to another document tab (<see cref="PodcastDocumentMode.Local"/>).</summary>
public sealed class PodcastActiveEventArgs : EventArgs
{
    /// <summary>Name of the document now shown; "Scaletta" is the main rundown.</summary>
    public string Name { get; set; } = "";
}

/// <summary>What a checkbox click does.</summary>
public enum PodcastTaskMode
{
    /// <summary>Rewrite the source and raise <c>ValueChanged</c> (default).</summary>
    Edit,
    /// <summary>Leave the source alone and raise <c>OnTaskToggle</c>: the host applies the change to <c>Value</c>.</summary>
    Notify,
}

/// <summary>Where supporting documents live.</summary>
public enum PodcastDocumentMode
{
    /// <summary>In <c>PodcastEpisode.Documents</c>, with tabs in the editor (default).</summary>
    Local,
    /// <summary>In the host: tabs are hidden and a document button only raises <c>OnOpenDocument</c>.</summary>
    Host,
}
