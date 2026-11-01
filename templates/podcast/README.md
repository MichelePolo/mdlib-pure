# Podcast plugin example

A complete application plugin, separate from the first-party package exports.
Copy `plugin.ts` and change its import from `../../src/index.ts` to `mdlib-pure`.
The full walkthrough is [docs/podcast.md](../../docs/podcast.md).
All participants, titles and document contents in the sample are fictional.

## Syntax

| Source | Meaning |
|---|---|
| `@Nora`, `@Elio`, `@Vera` | Configured participants, rendered as badges |
| `[](time:5:00:00)` | Five planned minutes for a section |
| `[](time:05:00)` | The two-field minutes:seconds form |
| `[scheda](Gobbo Vera)` | A separate supporting document, identified by name |
| `[ ]` / `[x]` | An incomplete/completed task, including outside a list |
| `_text_` | Underline in this preset; `*text*` is italic and `**text**` bold |

Options of `podcast({ … })` extend the grammar for an application that already
has rundowns in a richer form (every default keeps the sample's behavior):

| Option | Adds |
|---|---|
| `durations: 'clock'` | `[titolo](time:04:30)`, `1:05:00` (h:mm:ss), `5m`, `90s`, `2m30s`, from 1 s to 10 h; the chip shows the title and a clock |
| `tags: { mentions: 'any', hashtags: true, colors }` | Every `@name` and `#topic` as a coloured chip: a fixed colour from `colors`, else `#name(color:green)` written in the text, else a hue hashed from the name (`tagColor`, `tagColors`, `cssColor`) |
| `lineBlocks: true` | One source line = one block (no setext headings, no indented code); lines inside a tight list item stay in it, one per row |
| `looseTasks: true` | `[]`, `[ x ]`, a box without a following space, `-[]` / `1.[]` list markers glued to a box |

Titles are accepted in every time tag (`[intro](time:5:00:00)`) and
`[titolo](doc:name)` links a document with any title; `[scheda](name)` still works.
Tasks and timers know their source line and ordinal on it (`line`, `box` /
`index`); blocks that hold tasks get `podcastTasks` and `podcastDone`.

The episode total sums every recognized time tag in its main rundown, including
completed items. Linked documents are separate inputs and do not contribute.
Escapes, code, image alt text and link labels do not produce custom controls or
durations. Invalid complete duration tags remain visible and are reported.

Ordinary Markdown links always open in a new browser tab (`target="_blank"`,
`rel="noopener noreferrer"`), preserving the core URL safety policy.
The custom `[scheda](…)` control opens its document inside the editor.

## Files

- `plugin.ts`: parsing, safe VNode rendering, summary and source-range helpers.
- `plugin.test.ts`: grammar, source mapping, GFM interactions and pathological input.
- `editor.js`: shared, instance-scoped editor with state, callbacks and cleanup. Hosting
  options: `grammar`, `tagColors`, `tasks: 'notify'` (a click raises `onTaskToggle` instead of
  editing), `documents: 'host'` (a document button raises `onOpenDocument`), `readOnly`,
  `compact`, `current` and `runningTimer`, with `setTagColors`, `setReadOnly`, `setCurrent`
  and `setRunningTimer` on the instance.
- `../../site/client/podcast.js`: site initialization with opt-in local drafts.
- `../../site/lib/podcast-data.js`: initial rundown and supporting documents.
- `ui.js`: static UI markup, shared with the website and Blazor.
- `../../site/assets/podcast.css`: sample-local theme and responsive layout.

Run `npm run site:build` then `npm run site:serve`; open `/podcast/`.
Run `npm run verify` and `npm run test:browser` to check the sample with the library.

The [Blazor wrapper](../../bindings/blazor/README.md#podcasteditor) packages this editor as `PodcastEditor` since version 0.1.1 (GitHub release `blazor-v0.1.1`).
