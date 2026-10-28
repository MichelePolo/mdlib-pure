// Library adapters: one entry per (library, mode) row of the benchmark.
//
// Every row exposes:
//   create()  → (markdown: string) => html: string, built ONCE and reused
//               (instances, option objects and extension lists are not
//               rebuilt per call: that is how the libraries are meant to be used)
//   bundle    → the browser entry "as typically imported", bundled by the size
//               section of run.js (null: same bundle as the CommonMark row)
//   entities  → how that bundle decodes named entities (size table column)
//   options   → human-readable description of the configuration
//
// Throughput and conformance use the CommonMark reference configuration for
// every library: raw HTML passes through and URLs are NOT filtered. That is
// the only configuration in which all libraries can be asked to do the same
// work, and the one the spec examples assume. Each library's default safety
// policy is documented in README.md.

import { readFileSync } from 'node:fs'
import { HtmlRenderer, Parser } from 'commonmark'
import markdownit from 'markdown-it'
import { Marked } from 'marked'
import { micromark } from 'micromark'
import { gfm as micromarkGfm, gfmHtml as micromarkGfmHtml } from 'micromark-extension-gfm'
import snarkdown from 'snarkdown'
import { createMarkdown } from '../dist/index.js'
import { decodeEntity } from '../dist/entities.js'
import { gfm } from '../dist/gfm.js'

const benchDir = new URL('./', import.meta.url)
const version = (pkg) => JSON.parse(readFileSync(new URL(`node_modules/${pkg}/package.json`, benchDir), 'utf8')).version
const rootVersion = JSON.parse(readFileSync(new URL('../package.json', benchDir), 'utf8')).version

const allowAll = () => true

export const libs = [
  // ── CommonMark mode ──────────────────────────────────────────────────────
  {
    id: 'mdlib-pure',
    name: 'mdlib-pure',
    mode: 'CommonMark',
    baseline: true,
    version: rootVersion,
    options: '`createMarkdown({ html: true, allowUrl: () => true, decodeEntity })` (`decodeEntity` from `mdlib-pure/entities`: Node has no DOM to decode named entities)',
    create() {
      const md = createMarkdown({ html: true, allowUrl: allowAll, decodeEntity })
      return (s) => md.render(s)
    },
    bundle: `import { createMarkdown } from 'mdlib-pure'
const md = createMarkdown()
export const render = (s) => md.render(s)`,
    entities: 'DOM (browser)',
  },
  {
    id: 'marked',
    name: 'marked',
    mode: 'CommonMark',
    version: version('marked'),
    options: '`new Marked({ gfm: false })` (raw HTML always passes, no URL filtering)',
    create() {
      const md = new Marked({ gfm: false })
      return (s) => md.parse(s)
    },
    bundle: `import { marked } from 'marked'
export const render = (s) => marked.parse(s)`,
    entities: 'not decoded (left for the browser)',
  },
  {
    id: 'markdown-it',
    name: 'markdown-it',
    mode: 'CommonMark',
    version: version('markdown-it'),
    options: "`markdownit('commonmark')` (preset has `html: true`) + `md.validateLink = () => true`",
    create() {
      const md = markdownit('commonmark')
      md.validateLink = allowAll
      return (s) => md.render(s)
    },
    bundle: `import markdownit from 'markdown-it'
const md = markdownit()
export const render = (s) => md.render(s)`,
    entities: 'bundled table (`entities`)',
  },
  {
    id: 'commonmark',
    name: 'commonmark.js',
    mode: 'CommonMark',
    version: version('commonmark'),
    options: '`new Parser()` + `new HtmlRenderer()` (default `safe: false`)',
    create() {
      const parser = new Parser()
      const renderer = new HtmlRenderer()
      return (s) => renderer.render(parser.parse(s))
    },
    bundle: `import { HtmlRenderer, Parser } from 'commonmark'
const parser = new Parser()
const renderer = new HtmlRenderer()
export const render = (s) => renderer.render(parser.parse(s))`,
    entities: 'bundled tables (`entities` 3)',
  },
  {
    id: 'micromark',
    name: 'micromark',
    mode: 'CommonMark',
    version: version('micromark'),
    options: '`micromark(s, { allowDangerousHtml: true, allowDangerousProtocol: true })`',
    create() {
      const options = { allowDangerousHtml: true, allowDangerousProtocol: true }
      return (s) => micromark(s, options)
    },
    bundle: `import { micromark } from 'micromark'
export const render = (s) => micromark(s)`,
    entities: 'DOM (browser build of `decode-named-character-reference`)',
  },
  {
    id: 'snarkdown',
    name: 'snarkdown',
    mode: 'CommonMark',
    version: version('snarkdown'),
    options: '`snarkdown(s)` (no options; not CommonMark, regex-based, does not escape)',
    create() {
      return (s) => snarkdown(s)
    },
    bundle: `import snarkdown from 'snarkdown'
export const render = (s) => snarkdown(s)`,
    entities: 'not decoded',
  },

  // ── GFM mode ─────────────────────────────────────────────────────────────
  {
    id: 'mdlib-pure+gfm',
    name: 'mdlib-pure + gfm()',
    mode: 'GFM',
    baseline: true,
    version: rootVersion,
    options: 'as above + `plugins: gfm()` (all defaults: table, strikethrough, autolink, tasklist, footnotes, tagfilter, alerts)',
    create() {
      const md = createMarkdown({ html: true, allowUrl: allowAll, decodeEntity, plugins: gfm() })
      return (s) => md.render(s)
    },
    bundle: `import { createMarkdown } from 'mdlib-pure'
import { gfm } from 'mdlib-pure/gfm'
const md = createMarkdown({ plugins: gfm() })
export const render = (s) => md.render(s)`,
    entities: 'DOM (browser)',
  },
  {
    id: 'marked+gfm',
    name: 'marked',
    mode: 'GFM',
    version: version('marked'),
    options: '`new Marked()` (default `gfm: true`: tables, strikethrough, autolinks, task lists; no footnotes)',
    create() {
      const md = new Marked()
      return (s) => md.parse(s)
    },
    bundle: null, // same bundle as the CommonMark row: gfm is an option, not an import
  },
  {
    id: 'markdown-it+gfm',
    name: 'markdown-it',
    mode: 'GFM',
    version: version('markdown-it'),
    options: "`markdownit({ html: true, linkify: true })` ('default' preset: tables, strikethrough; linkify-it defaults) + `validateLink = () => true`; no task lists/footnotes without plugins",
    create() {
      const md = markdownit({ html: true, linkify: true })
      md.validateLink = allowAll
      return (s) => md.render(s)
    },
    bundle: null, // same bundle: linkify-it is always bundled
  },
  {
    id: 'micromark+gfm',
    name: 'micromark + gfm',
    mode: 'GFM',
    version: `${version('micromark')} + ${version('micromark-extension-gfm')}`,
    options: 'as above + `extensions: [gfm()], htmlExtensions: [gfmHtml()]` (micromark-extension-gfm)',
    create() {
      const options = {
        allowDangerousHtml: true,
        allowDangerousProtocol: true,
        extensions: [micromarkGfm()],
        htmlExtensions: [micromarkGfmHtml()],
      }
      return (s) => micromark(s, options)
    },
    bundle: `import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'
const options = { extensions: [gfm()], htmlExtensions: [gfmHtml()] }
export const render = (s) => micromark(s, options)`,
    entities: 'DOM (browser)',
  },
]

/**
 * Extra size-only rows: not a library mode of their own, but useful context
 * for the size table. Listed right after the row named in `after`.
 */
export const extraBundles = [
  {
    id: 'mdlib-pure+entities',
    name: 'mdlib-pure + /entities',
    mode: 'CommonMark',
    version: rootVersion,
    after: 'mdlib-pure',
    entities: 'bundled table (only needed without a DOM: Node, SSR, workers)',
    bundle: `import { createMarkdown } from 'mdlib-pure'
import { decodeEntity } from 'mdlib-pure/entities'
const md = createMarkdown({ decodeEntity })
export const render = (s) => md.render(s)`,
  },
]
