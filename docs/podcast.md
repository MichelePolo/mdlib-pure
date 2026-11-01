# Custom plugin sample: a podcast rundown

The [interactive podcast sample](https://michelepolo.github.io/mdlib-pure/podcast/)
demonstrates an application-specific grammar, a split editor, participant
completion, planned section durations and linked supporting documents. Its UI
and initial content are in Italian. Nora, Elio and Vera are fictional participants
discussing an imaginary rooftop garden; all titles and documents are invented.
The initial episode contains **one**
`[](time:5:00:00)` tag, so its total is **five minutes**.

This is a copyable example under [templates/podcast](../templates/podcast/README.md),
not a new package export. It uses the public parser and DOM renderer directly;
its controller is a dedicated editor rather than a configuration of
`<mdlib-editor>`, whose built-in plugin list and toolbar remain unchanged.

## Run locally

```sh
npm run site:build
npm run site:serve
# http://localhost:4173/podcast/
```

## Syntax and behavior

| Source | Behavior |
|---|---|
| `@Nora`, `@Elio`, `@Vera` | Participant badges; names match without case sensitivity. Unknown names and email addresses remain text. |
| `[](time:5:00:00)` | Duration of one section: minutes:seconds:centiseconds, **not** hours:minutes:seconds. |
| `[](time:05:00)` | Two fields mean minutes:seconds. |
| `[scheda](Gobbo Vera)` | A button opening a separate document in the editor. Spaces are allowed in names. The legacy `doc:` prefix is accepted. |
| `[ ]` / `[x]` / `[X]` | Tasks outside or inside lists, including multiple tasks on a line. Checking a task strikes its own segment. |
| `_text_` | Underline for this application. Use stars for italic (`*text*`) and bold (`**text**`). Double underscores are not part of this preset. |

The complete duration tag includes the empty brackets: `(time:5:00:00)` alone
is ordinary text. Minutes contain one to six digits, seconds exactly two digits
from 00 to 59, and centiseconds exactly two digits from 00 to 99. The optional
third field defaults to zero. Arithmetic uses integer centiseconds.

The total sums every recognized duration in the main **Scaletta** document,
including completed tasks. Checking a task does not change its planned duration.
Supporting documents have their own contents; their time tags are not added to
the main episode. Code, escapes, image alt text and link labels do not create
custom controls or time metadata. Complete invalid duration tags stay visible
with a validation message and contribute zero.

Document names are 1–160 characters, excluding parentheses, backslashes and
control characters. They are keys in a `Map`, not URLs or filesystem paths:
opening a document never fetches or executes its name. An unknown name opens a
new local document. The toolbar can link an existing document or create one.
`Scaletta` is reserved for the main document; `doc:` is a legacy link prefix,
not part of a new document's name.

Ordinary Markdown links always open in a new browser tab, both in the rundown
and in supporting documents. The custom `[scheda](…)` control opens its document
inside the editor.

## Hosting the editor in an application

An application that keeps the rundown on its own server, with its own grammar,
turns on what it needs and keeps the rest:

```js
const editor = mountPodcastEditor(host, {
  value: { source },
  participants: members,
  grammar: { durations: 'clock', lineBlocks: true, looseTasks: true, tags: { mentions: 'any', hashtags: true } },
  tagColors: { duke: '#a02622' },       // fixed colours by name; the same name gives the same colour everywhere
  tasks: 'notify',                      // a checkbox click only reports { document, id, checked, line, box }
  documents: 'host',                    // a document button only reports { name, title }; no tabs
  compact: true,                        // no header, legend or status bar
  current: 3,                           // 0-based source line of the current point, highlighted
  runningTimer: { line: 3, index: 0 },  // the timer chip counting down
  onTaskToggle: (e) => post('toggle', e),
  onOpenDocument: (e) => openPrompter(e.name),
  onChange: (state) => save(state.source),
})
editor.setCurrent(4); editor.setRunningTimer(null); editor.setReadOnly(true); editor.setTagColors(colors)
```

| Option | Grammar it adds (defaults keep the sample) |
|---|---|
| `durations: 'clock'` | `[titolo](time:04:30)`, `h:mm:ss`, `5m`, `90s`, `2m30s` (1 s to 10 h): the chip reads `⏱ titolo 04:30` |
| `tags.mentions: 'any'` | Every `@name` is a coloured chip, not only the participants; `tags.hashtags` adds `#topic` |
| `tags.colors` / `tagColors` | Fixed colours by name, compared ignoring case; otherwise `#name(color:green)` in the text, otherwise a hue hashed from the name (`tagColor()` in `plugin.ts`) |
| `lineBlocks: true` | One source line = one block: no paragraphs over several lines, no setext headings, no indented code |
| `looseTasks: true` | `[]`, `[ x ]`, a box without a following space, `-[]` / `1.[]` |

Blocks in the preview carry `data-line` (0-based) and `data-lines`; checkboxes
carry `data-line` and `data-box`, timer chips `data-line` and `data-timer`, so
the host's own line-based protocol keeps working. `readOnly` hides the toolbar
and the source while checkboxes and document buttons stay live; `disabled`
(the element attribute) makes everything inert. The panes take their height from
`--podcast-height` and the preview its font size from `--podcast-font-size`.

The Blazor `PodcastEditor` exposes the same options as parameters
(`Grammar`, `TagColors`, `Tasks`, `Documents`, `ReadOnly`, `Compact`,
`CurrentLine`, `RunningTimer`) and the callbacks as `EventCallback`s
(`OnTaskToggle`, `OnOpenDocument`, `OnActiveDocumentChanged`); see the
[Blazor README](../bindings/blazor/README.md#podcasteditor).

## How it is built

The [plugin source](../templates/podcast/plugin.ts) contains inline rules,
a delimiter rule and a transform. It is independent of the UI:

```ts
import { createMarkdown } from 'mdlib-pure'
import { gfm } from 'mdlib-pure/gfm'
import { podcast, getPodcastSummary } from './plugin.ts'

const md = createMarkdown({
  plugins: [...gfm(), podcast({ participants: ['Nora', 'Elio', 'Vera'] })],
  positions: true,
})
const root = md.parse(source)
md.renderTo(preview, root)
const { centiseconds } = getPodcastSummary(root)
```

1. A rule dispatched on `@` looks up configured names in a `Map`.
2. A rule before `openBracket` recognizes complete time and document tags and
   standalone checkbox markers. Length bounds keep failed matches cheap.
3. A delimiter rule gives single underscores the application's underline meaning.
4. A transform assigns per-document checkbox IDs and groups completed segments.
5. Renderers produce VNodes: text is escaped, document names are data attributes,
   ordinary Markdown links use `target="_blank"` and `rel="noopener noreferrer"`
   while retaining the core URL policy. Raw HTML stays off.
6. `getPodcastSummary(root)` walks the AST, returning `centiseconds`, `tasks`,
   `completed` and `invalid`. Metadata is never kept on a shared plugin object.

The new AST node shapes are documented at the top of `plugin.ts`.
`taskRanges(source, root)` maps checkbox nodes back to exact source ranges using
`positions: true`. This skips markers in code or escapes. Checkbox controls in
transformed content without an exact paragraph/heading source location (for
example a table cell) remain read-only. Their syntax is still rendered.

The [shared editor controller](../templates/podcast/editor.js) implements the application:

- Default split view, resizable horizontally with a pointer or the separator's
  arrow keys; stacked panes on narrow screens, plus write/read views.
- Toolbar actions insert the actual source syntax at the current selection.
- Typing `@` opens a filtered list: Up/Down, Enter or Tab, Escape, or pointer
  selection. Composition input and email addresses do not trigger completion.
- Time fields insert a complete tag, or replace the tag under the caret.
- Tabs maintain separate document contents, selections and undo/redo histories.
- Checkbox clicks edit source, then reparse and render it.
- A localStorage draft saves all documents in this browser. If storage fails,
  the UI explicitly reports session-only storage. No data is sent to a server.
- Reset asks before replacing local drafts with the example.

The markup lives in [ui.js](../templates/podcast/ui.js) and the initial
documents in [podcast-data.js](../site/lib/podcast-data.js). To use another cast,
configure both the plugin's participant list and the controller's suggestions.

## Using this example with Blazor

The [Blazor wrapper 0.1.1](../bindings/blazor/README.md#podcasteditor) includes
`PodcastEditor`, sharing this sample's parser, controller, toolbar and styles.
It binds the entire episode to a C# `PodcastEpisode`, with configurable
participants, supporting documents and the planned total:

```razor
<PodcastEditor @bind-Value="Episode" Participants="People" />

@code {
    private string[] People = ["Nora", "Elio", "Vera"];
    private PodcastEpisode Episode { get; set; } = new()
    {
        Source = "[ ] @Nora Introduction [](time:5:00:00)"
    };
}
```

Install the 0.1.1 package from the
[`blazor-v0.1.1` GitHub release](https://github.com/MichelePolo/mdlib-pure/releases/tag/blazor-v0.1.1)
following the [installation instructions](../bindings/blazor/README.md#install);
the older `blazor-v0.1.0` release predates this component. The package
loads its JavaScript and styles automatically; the app owns saving via
`ValueChanged` or `@bind-Value:after`. No localStorage is used by the wrapper.
Static SSR posts the whole episode as JSON; the interactive render modes bind
it directly. The demo has `/podcast/server`, `/podcast/wasm`, `/podcast/auto` and
`/podcast/ssr` pages, covered by end-to-end tests.

The standard `MarkdownEditor`, `MarkdownPlugins`, named configs and AST service
remain unchanged. `PodcastEditor` is the dedicated component for this grammar.

## Styling and tests

[podcast.css](../site/assets/podcast.css) scopes the dark studio design to the
sample. Speaker colors, planned duration color, backgrounds and text use
semantic sample tokens; see [Design tokens](tokens.md#podcast-sample-tokens).
The core theme, library API and package size remain unchanged.

[Parser tests](../templates/podcast/plugin.test.ts) cover valid/invalid syntax,
escaping, source ranges, independent parses, both GFM plugin orders and hostile
input. [Chromium tests](../test/browser/podcast.browser.ts) cover completion,
toolbar insertion, new browser tabs for links, totals, checkbox editing, document tabs, storage, undo and responsive
layout. Run `npm run verify`, `npm run test:browser` and `npm run site:build`.
