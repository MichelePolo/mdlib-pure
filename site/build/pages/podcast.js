import { podcastMarkup } from '../../lib/podcast-ui.js'
import { asset, page } from '../layout.js'
import { makeMarkdown, read, rel } from '../context.js'

const PATH = '/podcast/'
export function podcastSample() {
  const md = `# Podcast rundown: a custom plugin sample

A working split editor with participant completion, section durations, interactive
checkboxes and separate supporting documents. The sample uses fictional people
and content in Italian, and starts with exactly one five-minute duration tag.

Open [the interactive sample](/podcast/). Read [the implementation guide](/docs/podcast/)
for the grammar, AST, source files, customization and tests.

${read('templates/podcast/README.md').split('## Syntax')[1]?.split('## Files')[0] ?? ''}`
  return {
    path: PATH,
    md,
    html: page({
      path: PATH, section: 'samples', title: 'Podcast rundown',
      description: 'A custom Markdown plugin in a working podcast rundown: split editor, mentions, planned durations and linked documents.',
      body: `<div class="podcast-page"><a class="podcast-back" href="${rel(PATH, '/samples/')}">← All samples</a>${podcastMarkup()}<noscript><p>This interactive editor needs JavaScript. <a href="${rel(PATH, '/docs/podcast/')}">Read the sample guide</a>.</p></noscript><div class="podcast-guide md">${makeMarkdown([]).render(`**A custom plugin, in a real editor.** This sample uses the public \`createMarkdown\`, \`parse\` and \`renderTo\` APIs. [Read how it works](${rel(PATH, '/docs/podcast/')}), including the syntax, source code and tests.`)}</div></div>`,
      head: `<link rel="stylesheet" href="${asset(PATH, 'podcast.css')}">`,
      scripts: [asset(PATH, 'js/podcast.js')],
    }),
  }
}
