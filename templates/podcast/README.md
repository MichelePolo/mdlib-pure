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
- `editor.js`: shared, instance-scoped editor with state, callbacks and cleanup.
- `../../site/client/podcast.js`: site initialization with opt-in local drafts.
- `../../site/lib/podcast-data.js`: initial rundown and supporting documents.
- `ui.js`: static UI markup, shared with the website and Blazor.
- `../../site/assets/podcast.css`: sample-local theme and responsive layout.

Run `npm run site:build` then `npm run site:serve`; open `/podcast/`.
Run `npm run verify` and `npm run test:browser` to check the sample with the library.

The [Blazor wrapper](../../bindings/blazor/README.md#podcasteditor) packages this editor as `PodcastEditor` in version 0.1.1 built from source.
