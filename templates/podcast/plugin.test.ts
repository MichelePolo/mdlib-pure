import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createMarkdown, visit, type Node } from '../../src/index.ts'
import { gfm } from '../../src/gfm/index.ts'
import { budget } from '../../test/helpers.ts'
import { durationLabel, formatDuration, getPodcastSummary, parseDuration, podcast, taskRanges } from './plugin.ts'

const md = createMarkdown({ plugins: [podcast()], positions: true })
const nodes = (source: string, type: string): Node[] => {
  const out: Node[] = []
  visit(md.parse(source), (n) => { if (n.type === type) out.push(n) })
  return out
}

describe('podcast sample plugin', () => {
  test('one five-minute tag is five minutes; sums all tags including completed tasks', () => {
    const source = '[x] @Vera Apertura [](time:5:00:00)\n\n[ ] Chiusura'
    assert.deepEqual(getPodcastSummary(md.parse(source)), { centiseconds: 30000, tasks: 2, completed: 1, invalid: 0 })
    assert.equal(getPodcastSummary(md.parse(`${source}\n\n[](time:02:30:50) [](time:0:00:75)`)).centiseconds, 45125)
    assert.equal(getPodcastSummary(md.parse('Nuovo episodio')).centiseconds, 0, 'no shared parse state')
    assert.equal(formatDuration(45125), '7:31:25')
    assert.equal(durationLabel(30000), '5 min')
    assert.equal(durationLabel(125), '0 min 1,25 s')
  })
  test('durations use minutes:seconds:centiseconds, with the legacy two-field form', () => {
    for (const [text, expected] of [['5:00:00', 30000], ['05:00', 30000], ['75:59:99', 455999], ['0:00:00', 0]] as const) assert.equal(parseDuration(text), expected)
    for (const text of ['5:60:00', '5:00:100', '5:0:00', '-5:00:00', '1e3:00:00', '1000000:00:00', '5:00:00\n']) assert.equal(parseDuration(text), null, text)
  })
  test('the complete tag is required; invalid durations stay visible and do not count', () => {
    assert.equal(getPodcastSummary(md.parse('(time:5:00:00) [] (time:5:00:00)')).centiseconds, 0)
    const source = '[](time:5:99:00) [](time:5:) [](time:5:00:00'
    const html = md.render(source)
    assert.ok(html.includes('[](time:5:99:00)'))
    assert.ok(html.includes('[](time:5:00:00'))
    assert.equal(getPodcastSummary(md.parse(source)).centiseconds, 0)
    assert.equal(getPodcastSummary(md.parse(source)).invalid, 2)
  })
  test('known participants get badges; emails and unknown names stay ordinary text', () => {
    assert.deepEqual(nodes('@Nora @elio @Vera', 'podcastMention').map((n) => n.name), ['Nora', 'Elio', 'Vera'])
    assert.equal(nodes('mail@Nora name+tag@Vera @Unknown @constructor @Noradom', 'podcastMention').length, 0)
    assert.match(md.render('@Vera'), /podcast-person-2/)
    assert.match(createMarkdown({ plugins: [podcast({ participants: ['Alice'] })] }).render('@Alice'), /podcast-mention/)
  })
  test('document names accept spaces, never become executable URLs, and support doc: placeholders', () => {
    assert.deepEqual(nodes('[scheda](Gobbo Vera) [scheda](doc:Scheda ospite.md)', 'podcastDocument').map((n) => n.name), ['Gobbo Vera', 'Scheda ospite.md'])
    const html = md.render('[scheda](javascript:alert) [scheda](<img src=x onerror=alert>)')
    assert.ok(!html.includes('href='))
    assert.ok(!html.includes('<img'))
    assert.ok(html.includes('&lt;img'))
    assert.equal(nodes('[scheda]() [scheda](bad\nname) [scheda](bad(name))', 'podcastDocument').length, 0)
  })
  test('code, escapes, images and link labels do not create interactive tags or durations', () => {
    for (const source of ['`[](time:5:00:00) @Nora [x] [scheda](Note)`', '```\n[](time:5:00:00)\n```', '\\[](time:5:00:00)', '[[](time:5:00:00)](https://example.com)', '![[](time:5:00:00)](image.png)']) {
      assert.equal(getPodcastSummary(md.parse(source)).centiseconds, 0, source)
    }
    assert.equal(nodes('\\@Nora `@Nora` [@Nora](https://example.com)', 'podcastMention').length, 0)
    assert.equal(nodes('\\[x] ` [x] ` [[x] ](https://example.com)', 'podcastTask').length, 0)
  })
  test('ordinary links open new tabs, retaining titles, escaping and URL safety', () => {
    const source = '[**sito**](https://example.com "Titolo & note") [ref][id] <https://example.com/auto> https://example.com/bare [locale](/notes) [sezione](#notes)\n\n[id]: https://example.com/ref'
    for (const plugins of [[podcast(), ...gfm()], [...gfm(), podcast()]]) {
      const instance = createMarkdown({ plugins })
      const html = instance.render(source)
      assert.equal((html.match(/<a /g) ?? []).length, 6)
      assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) ?? []).length, 6)
      assert.match(html, /title="Titolo &amp; note"/)
      assert.match(html, /<strong>sito<\/strong><\/a>/)
      assert.match(instance.render('[unsafe](javascript:alert%281%29)'), /href="" target="_blank" rel="noopener noreferrer"/)
    }
    assert.equal(createMarkdown().render('[sito](https://example.com)'), '<p><a href="https://example.com">sito</a></p>\n')
  })
  test('underscore underlines in this preset, stars keep normal emphasis/strong', () => {
    assert.equal(md.render('_sottolineato_ *corsivo* **grassetto**'), '<p><u>sottolineato</u> <em>corsivo</em> <strong>grassetto</strong></p>\n')
    assert.equal(createMarkdown().render('_normale_'), '<p><em>normale</em></p>\n')
  })
  test('checkboxes work standalone, inline and inside lists in either GFM order', () => {
    const source = '[x] @Vera Apertura [](time:5:00:00)\n[ ] Chiusura\n\n- [ ] intro [x] ospite\n\n| voce | nota |\n| --- | --- |\n| @Nora | [](time:1:00) |'
    for (const plugins of [[podcast(), ...gfm()], [...gfm(), podcast()]]) {
      const instance = createMarkdown({ plugins })
      assert.deepEqual(getPodcastSummary(instance.parse(source)), { centiseconds: 36000, tasks: 4, completed: 2, invalid: 0 })
      assert.match(instance.render(source), /<table>/)
    }
  })
  test('checked segments end at the next checkbox or newline; badges stay outside struck text', () => {
    const html = md.render('[x] @Vera fatto [ ] da fare\nNuova riga')
    assert.equal((html.match(/is-complete/g) ?? []).length, 1)
    assert.match(html, /class="podcast-words"> fatto /)
    assert.ok(!html.includes('podcast-words"><span class="podcast-mention'))
    assert.match(html, /<br \/>\nNuova riga/)
  })
  test('exact source ranges avoid escaped/code markers, work across containers and CRLF', () => {
    const source = '\uFEFF# [ ] Titolo\r\n\r\n`[x]` e \\[x] testo [x] vero\r\n[ ] seconda riga\r\n\r\n> - [ ] Lista\r\n>   [X] continuazione\r\n\r\n[ ] uguale\r\n\r\n[ ] uguale'
    const ranges = [...taskRanges(source, md.parse(source)).values()]
    assert.equal(ranges.length, 7)
    assert.deepEqual(ranges.map(([start, end]) => source.slice(start, end)), ['[ ]', '[x]', '[ ]', '[ ]', '[X]', '[ ]', '[ ]'])
    assert.equal(ranges[1][0], source.indexOf('[x] vero'))
    assert.equal(ranges[4][0], source.indexOf('[X]'))
  })
  test('adversarial malformed tags, repeated tasks and long names stay bounded', () => {
    const start = performance.now()
    for (const source of ['[](time:'.repeat(20000), '[scheda]('.repeat(20000), '@'.repeat(100000), '@' + 'a'.repeat(200000), '[ ] word '.repeat(20000)]) {
      const root = md.parse(source)
      getPodcastSummary(root)
      taskRanges(source, root)
    }
    assert.ok(performance.now() - start < budget(2000))
  })
})
