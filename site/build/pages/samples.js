// Samples: Markdown source next to its output, rendered at build time.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createMarkdown } from '../../../src/index.ts'
import { toElements } from '../../../src/adapter.ts'
import { decodeEntity } from '../../../src/entities/index.ts'
import { getFrontmatter } from '../../../src/plugins/frontmatter.ts'
import { configFor, pluginsFor } from '../../lib/plugins.js'
import { SAMPLES } from '../../lib/samples.js'
import { escapeHtml, fenceFor, makeMarkdown, read, rel } from '../context.js'
import { asset, page } from '../layout.js'
import { codeBlock, katexHead, pair } from './parts.js'

const PATH = '/samples/'

/** The `classes` map of the Tailwind sample (also scanned by the Tailwind build). */
export const TW_CLASSES = {
  heading: 'font-semibold tracking-tight',
  heading2: 'mb-3 text-2xl',
  paragraph: 'my-3 leading-7',
  link: 'font-medium text-(--md-color-link) underline decoration-2 underline-offset-4',
  inlineCode: 'rounded bg-current/10 px-1 font-mono text-sm',
  list: 'my-3 list-disc pl-6 marker:text-(--md-color-link)',
  blockquote: 'my-3 border-l-4 border-(--md-color-link) pl-4 italic',
}

const twConfig = `createMarkdown({
  classes: {
${Object.entries(TW_CLASSES)
  .map(([k, v]) => `    ${k}: '${v}',`)
  .join('\n')}
  },
})`

const HIGHLIGHT_CONFIG = `import { createMarkdown, h } from 'mdlib-pure'
import { grammars, tokenize } from './highlight.js' // ~60 lines, site/lib/highlight.js

const md = createMarkdown({
  // VNodes keep renderTo() on its DOM-safe path; null means default rendering
  highlight: (code, lang) =>
    grammars.has(lang)
      ? tokenize(code, grammars.get(lang)).map(([cls, text]) => (cls ? h('span', { class: \`tok-\${cls}\` }, text) : text))
      : null,
})`

const REACT_CONFIG = `import { createElement } from 'react'
import { createMarkdown } from 'mdlib-pure'
import { gfm } from 'mdlib-pure/gfm'
import { toElements } from 'mdlib-pure/adapter'

const md = createMarkdown({ plugins: gfm() })

export function Markdown({ source }) {
  return <article className="md">{toElements(md.toVNodes(source), createElement, 'react')}</article>
}`

export function samples() {
  const prose = makeMarkdown([])
  const inline = (s) => prose.render(s).replace(/^<p>|<\/p>\n$/g, '')
  let usesMath = false
  const twinParts = []

  const sections = SAMPLES.map((s) => {
    const source = read(`site/content/samples/${s.id}.md`)
    let output
    let config = configFor(s.plugins)
    let configLang = 'js'
    let after = ''
    let afterMd = ''
    let label = 'Result'
    let outAttrs = ''
    if (s.special === 'tailwind') {
      const md = createMarkdown({ decodeEntity, classes: TW_CLASSES })
      output = `<template shadowrootmode="open"><link rel="stylesheet" href="${asset(PATH, 'tailwind-sample.css')}"><div class="tw-root">${md.render(source)}</div></template>`
      config = twConfig
      label = 'Result (Tailwind CSS v4 utilities, no theme)'
      outAttrs = ' data-tailwind'
    } else if (s.special === 'react') {
      const md = createMarkdown({ decodeEntity, plugins: pluginsFor(s.plugins) })
      output = renderToStaticMarkup(createElement('div', null, ...toElements(md.toVNodes(source), createElement, 'react'))).replace(/^<div>|<\/div>$/g, '')
      config = REACT_CONFIG
      configLang = 'jsx'
      label = 'Result (react-dom/server)'
    } else {
      const md = makeMarkdown(s.plugins, { highlighted: s.special === 'highlight' })
      output = md.render(source)
      if (s.special === 'highlight') config = HIGHLIGHT_CONFIG
      if (s.special === 'frontmatter') {
        const fm = JSON.stringify(getFrontmatter(md.parse(source)), null, 2)
        after = codeBlock('json', fm, 'getFrontmatter(md.parse(source))')
        afterMd = `\`getFrontmatter(md.parse(source))\` returns:\n\n\`\`\`json\n${fm}\n\`\`\`\n`
      }
    }
    const math = s.plugins.includes('math')
    usesMath ||= math
    const playground = s.playground === false ? '' : `<a href="${rel(PATH, '/playground/')}#sample=${s.id}">Open in the playground</a>`
    const fence = fenceFor(source)
    twinParts.push(`## ${s.title}

${s.description}

\`\`\`${configLang}
${config}
\`\`\`

${fence}markdown
${source}${fence}
${afterMd ? `\n${afterMd}` : ''}`)
    return `
    <section class="item wrap" id="${s.id}" aria-labelledby="${s.id}-title">
      <h2 class="title" id="${s.id}-title"><span class="mk" aria-hidden="true">##</span>${escapeHtml(s.title)}</h2>
      <div class="md prose"><p>${inline(s.description)}</p></div>
      ${config.includes('\n') ? codeBlock(configLang, config, 'Configuration') : `<p class="config">Configuration: <code>${escapeHtml(config)}</code></p>`}
      ${pair(source, output, { math, label, cls: s.special === 'tailwind' ? 'tw-host pane-out' : undefined, outAttrs })}
      ${after}
      ${playground ? `<p class="item-links">${playground}</p>` : ''}
    </section>`
  })

  const intro = 'Each sample shows its Markdown next to the output, rendered when this site was built by the same library you would install. Math is typeset in your browser by KaTeX; everything else is static HTML.'
  const body = `
    <header class="page-head wrap">
      <h1 class="title"><span class="mk" aria-hidden="true">#</span>Samples</h1>
      <p class="lede">${escapeHtml(intro)}</p>
      <nav aria-label="Samples on this page"><ul class="jump">${SAMPLES.map((s) => `<li><a href="#${s.id}">${escapeHtml(s.title)}</a></li>`).join('')}</ul></nav>
    </header>
    ${sections.join('\n')}`

  const html = page({
    path: PATH,
    section: 'samples',
    title: 'Samples',
    description: 'mdlib-pure samples, source next to output: CommonMark, GFM, math with KaTeX, definition lists, containers, mark, front matter, syntax highlighting, Tailwind classes and React.',
    body,
    // The document also loads the Tailwind build: @property rules only register
    // at document level, and the shadow root's utilities rely on them.
    head: `${usesMath ? katexHead(PATH) : ''}\n  <link rel="stylesheet" href="${asset(PATH, 'tailwind-sample.css')}">`,
  })
  const twin = `# Samples\n\n${intro}\n\n${twinParts.join('\n')}`
  return { path: PATH, html, md: twin }
}
