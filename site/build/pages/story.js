// Built with AI: the story (site/content/story.md), the screenshots listed in
// docs/screenshots/README.md (parsed with mdlib-pure) and the commit history.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { visit } from '../../../src/util/visit.ts'
import { escapeHtml, makeMarkdown, read, rel, REPO, ROOT, rewriteTwin, siteLinks } from '../context.js'
import { page } from '../layout.js'

const PATH = '/story/'
export const SHOTS_DIR = '/story/screenshots/'

/** Commits, oldest first, or [] outside a git checkout. */
function history() {
  try {
    const out = execFileSync('git', ['log', '--reverse', '--date=iso-strict', '--format=%h%x1f%ad%x1f%s%x1f%(trailers:key=Co-Authored-By,valueonly,separator=%x2c)%x1e'], { cwd: ROOT, encoding: 'utf8' })
    return out
      .split('\x1e')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const [hash, date, subject, coauthors] = r.split('\x1f')
        return { hash, date: new Date(date), subject, claude: /Claude/.test(coauthors) }
      })
  } catch {
    return []
  }
}

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file) {
  const b = readFileSync(file)
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

/** Rows of the table in docs/screenshots/README.md: file name and caption. */
export function screenshots() {
  const md = makeMarkdown(['gfm'], { highlighted: false })
  const root = md.parse(read('docs/screenshots/README.md'))
  const shots = []
  visit(root, (n) => {
    if (n.type !== 'table') return
    for (const row of n.children.slice(1)) {
      const [fileCell, captionCell] = row.children
      const code = fileCell.children.find((c) => c.type === 'inlineCode')
      if (!code) continue
      const caption = { type: 'root', children: [{ type: 'paragraph', children: captionCell.children }] }
      shots.push({ file: code.value, captionHtml: md.render(caption).replace(/^<p>|<\/p>\n$/g, ''), captionMd: read('docs/screenshots/README.md').split('\n').find((l) => l.includes(`\`${code.value}\``))?.split('|')[2]?.trim() ?? '' })
    }
    return false
  })
  return shots
}

const time = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })
const day = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Rome' })

export function story() {
  const commits = history()
  let stats = ''
  if (commits.length) {
    const first = commits[0].date
    const last = commits.at(-1).date
    const claude = commits.filter((c) => c.claude).length
    const span = day(first) === day(last) ? `between ${time(first)} and ${time(last)} (CET) on ${day(first)}` : `from ${day(first)} to ${day(last)}`
    stats = `The history has ${commits.length} commits, ${span}; ${claude === commits.length ? 'every one of them carries' : `${claude} of them carry`} a \`Co-Authored-By: Claude\` trailer.`
  }
  const source = read('site/content/story.md').replace('{{stats}}', stats)
  const md = makeMarkdown(['gfm', 'headings'], { extra: [siteLinks({ from: PATH })] })
  const article = md.render(source)

  const shots = screenshots()
  const gallery = shots
    .map((s) => {
      const { width, height } = pngSize(join(ROOT, 'docs/screenshots', s.file))
      return `<li><figure>
          <a href="screenshots/${s.file}"><img src="screenshots/${s.file}" width="${width}" height="${height}" loading="lazy" decoding="async" alt="Screenshot: ${escapeHtml(s.file.replace(/\.png$/, ''))}"></a>
          <figcaption><code>${escapeHtml(s.file)}</code>: ${s.captionHtml}</figcaption>
        </figure></li>`
    })
    .join('\n        ')
  const timeline = commits
    .map((c) => `<li><time datetime="${c.date.toISOString()}">${time(c.date)}</time><a class="hash" href="${REPO}/commit/${c.hash}">${c.hash}</a><span>${escapeHtml(c.subject)}</span></li>`)
    .join('\n          ')

  const body = `
    <div class="wrap story">
      <article class="md prose doc-body">
${article}
      </article>
      <section aria-labelledby="screenshots" class="story-part">
        <h2 class="title" id="screenshots"><span class="mk" aria-hidden="true">##</span>Screenshots</h2>
        <p class="prose">Captured with Playwright in Chromium while the library and this site were built; the captions come from <a href="${REPO}/blob/main/docs/screenshots/README.md"><code>docs/screenshots/README.md</code></a>, parsed with mdlib-pure.</p>
        <ul class="gallery">
        ${gallery}
        </ul>
      </section>
      ${
        commits.length
          ? `<section aria-labelledby="history" class="story-part">
        <h2 class="title" id="history"><span class="mk" aria-hidden="true">##</span>Commit history</h2>
        <p class="prose">Every commit, oldest first, from <code>git log</code> at build time (times in CET).</p>
        <ol class="timeline">
          ${timeline}
        </ol>
      </section>`
          : ''
      }
    </div>`

  const html = page({
    path: PATH,
    section: 'story',
    title: 'Built with AI',
    description: 'How mdlib-pure was built with AI: AGENTS.md dogfooded by agents, bugs found by adversarial tests and reviews, maintainer decisions and CI, from the git history.',
    body,
  })

  const twin = `${rewriteTwin(source, { from: '/story.md' })}
## Screenshots

${shots.map((s) => `- [\`${s.file}\`](${rel('/story.md', SHOTS_DIR + s.file)}): ${s.captionMd}`).join('\n')}
${
  commits.length
    ? `
## Commit history

${commits.map((c, i) => `${i + 1}. ${time(c.date)} [\`${c.hash}\`](${REPO}/commit/${c.hash}) ${c.subject}`).join('\n')}
`
    : ''
}`
  return { path: PATH, html, md: twin, shots }
}
