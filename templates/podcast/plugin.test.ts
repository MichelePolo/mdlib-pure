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

// The grammar of the Cyberdyne podcast studio, as options: its old rundowns must still read the same.
import { cssColor, formatClock, parseClock, tagColor, tagColors, tagTextColor } from './plugin.ts'

const studio = createMarkdown({
  plugins: [...gfm(), podcast({ participants: ['Campa'], durations: 'clock', tags: { mentions: 'any', hashtags: true, colors: { Campa: '#123456' } }, lineBlocks: true, looseTasks: true })],
  positions: true,
})
const pick = (source: string, type: string): Node[] => {
  const out: Node[] = []
  visit(studio.parse(source), (n) => { if (n.type === type) out.push(n) })
  return out
}

describe('podcast plugin, studio options', () => {
  test('clock durations: m:ss, h:mm:ss, units, titles; 1 s to 10 h', () => {
    for (const [text, expected] of [['4:30', 270], ['04:30', 270], ['1:05:00', 3900], ['5m', 300], ['90s', 90], ['2m30s', 150], ['10:00:00', 36000]] as const) assert.equal(parseClock(text), expected, text)
    for (const text of ['0:00', '10:00:01', '5:60', '99999s', '5', 'abc', '1:60:00']) assert.equal(parseClock(text), null, text)
    assert.equal(parseClock('1:2:03'), 3723, 'like the server: hours, minutes, seconds')
    assert.equal(formatClock(270), '04:30')
    assert.equal(formatClock(3900), '1:05:00')
    const timers = pick('- [ ] Apertura [intro](time:04:30) [](time:1:05:00) [x](time:5m)', 'podcastTime')
    assert.deepEqual(timers.map((t) => [t.title, t.centiseconds, t.line, t.index]), [['intro', 27000, 0, 0], ['', 390000, 0, 1], ['x', 30000, 0, 2]])
    assert.match(studio.render('[intro](time:04:30)'), /<span class="podcast-time" data-line="0" data-timer="0" title="[^"]*">⏱ intro 04:30<\/span>/)
    assert.equal(pick('[](time:0:00) [](time:5:60)', 'podcastInvalidTime').length, 2)
    assert.equal(getPodcastSummary(studio.parse('[](time:5:00:00)')).centiseconds, 1800000, 'h:mm:ss, not centiseconds')
  })
  test('tags: free @names and #topics, the same colours as the server, fixed and defined colours', () => {
    for (const [name, color, text] of [['duke', '#a02622', '#fff'], ['Campa', '#8da022', '#fff'], ['intro', '#c6b62a', '#111'], ['ospite', '#22a067', '#fff'], ['x', '#d8469d', '#fff'], ['Ñandú', '#50d846', '#111'], ['a-b_c9', '#78a022', '#fff'], ['VERA', '#22a02a', '#fff']] as const) {
      assert.equal(tagColor(name), color, name)
      assert.equal(tagTextColor(color), text, name)
    }
    assert.equal(tagColor('duke', { DUKE: '#000000' }), '#000000')
    assert.equal(tagColor('duke', new Map([['duke', '#010203']])), '#010203')
    assert.equal(cssColor('Green'), '#008000')
    assert.equal(cssColor('#0F0'), '#00ff00')
    assert.equal(cssColor('abc123'), '#abc123')
    assert.equal(cssColor('rgb(1,2,3)'), null)
    const tags = pick('#intro e @duke con @campa, poi #Tema(color:green) e #altro(color:nope)', 'podcastTag')
    assert.deepEqual(tags.map((t) => [t.prefix, t.name, t.color, t.defined]), [['#', 'intro', '#c6b62a', false], ['@', 'duke', '#a02622', false], ['@', 'campa', '#123456', false], ['#', 'Tema', '#008000', true], ['#', 'altro', tagColor('altro'), false]])
    const html = studio.render('#Tema(color:green) #altro(color:nope)')
    assert.match(html, /<span class="podcast-tag" style="background:#008000;color:#fff" data-tag="tema" title="[^"]*">#Tema<\/span> <span class="podcast-tag"[^>]*>#altro<\/span>\(color:nope\)/)
    assert.equal(pick('duke@sito.it a&#x40;b x#y `#code` [#link](https://example.com) @@doppio', 'podcastTag').length, 0)
    assert.equal(studio.render('# Titolo'), '<h1>Titolo</h1>\n', 'a heading is not a tag')
    assert.deepEqual([...tagColors('#a(color:red) @b(color:#0f0) #a(color:blue) x#c(color:red) #d(color:nope)')], [['a', '#ff0000'], ['b', '#00ff00']])
  })
  test('loose tasks: [], [ x ], glued list markers and boxes without a following space', () => {
    for (const spelled of ['- [ ] Tema', '-[] Tema', '- [] Tema', '* [ ] Tema', '*[] Tema', '1. [ ] Tema', '1.[] Tema', '  - [ ] Tema', '- [ ]Tema']) {
      const root = studio.parse(spelled)
      assert.equal(root.children[0].type, 'list', spelled)
      const tasks: Node[] = []
      visit(root, (n) => { if (n.type === 'podcastTask') tasks.push(n) })
      assert.deepEqual(tasks.map((t) => [t.checked, t.line, t.box]), [[false, 0, 0]], spelled)
    }
    assert.deepEqual(pick('  * [X] Fatto \n-[x]Fatto\n- [ x ] Fatto', 'podcastTask').map((t) => [t.checked, t.line]), [[true, 0], [true, 1], [true, 2]])
    assert.equal(pick('[x](https://example.com) `[]` \\[] a[] b', 'podcastTask').length, 0)
    assert.equal(studio.parse('-testo').children[0].type, 'paragraph', 'a marker without a space is not a bullet')
    assert.deepEqual(pick('- [ ] intro [ ] ospite [](time:5m)', 'podcastTask').map((t) => [t.line, t.box]), [[0, 0], [0, 1]])
    const source = '[ ] a\n[x] b\n\n-[] c [ ] d'
    const ranges = [...taskRanges(source, studio.parse(source)).values()].map(([s, e]) => source.slice(s, e))
    assert.deepEqual(ranges, ['[ ]', '[x]', '[]', '[ ]'])
  })
  test('line blocks: one line is one block, no setext headings or indented code, tight items keep their rows', () => {
    const root = studio.parse('Riga uno\nRiga due\nTitolo\n---\n    rientrata')
    assert.deepEqual(root.children.map((n) => [n.type, n.position?.start.line]), [['paragraph', 1], ['paragraph', 2], ['paragraph', 3], ['thematicBreak', 4], ['paragraph', 5]])
    assert.equal(studio.render('Riga uno\nRiga due'), '<p>Riga uno</p>\n<p>Riga due</p>\n')
    assert.deepEqual(pick('[ ] a\n[x] b', 'podcastTask').map((t) => [t.line, t.box, t.blockLine]), [[0, 0, 1], [1, 0, 1]])
    const item = studio.render('- [ ] A\n[ ] B\n- C')
    assert.match(item, /<li>.*A.*<br \/>\n.*B.*<\/li>/s)
    assert.deepEqual(pick('- [ ] A\n[ ] B', 'podcastTask').map((t) => t.line), [0, 1])
    const source = 'x\n[ ] a\n[x] b'
    assert.deepEqual([...taskRanges(source, studio.parse(source)).values()].map(([s, e]) => source.slice(s, e)), ['[ ]', '[x]'])
    const done = studio.parse('[x] a [x] b\n[ ] c [x] d').children
    assert.deepEqual(done.map((n) => [n.podcastTasks, n.podcastDone]), [[2, true], [2, false]])
    assert.equal(md.render('Riga uno\nRiga due'), '<p>Riga uno\nRiga due</p>\n', 'the default keeps CommonMark paragraphs')
  })
  test('document links with any title and the doc: scheme; the sample form still works', () => {
    assert.deepEqual(pick('[Scheda ospite](doc:Scheda ospite.md) [scheda](Gobbo) [x](doc:) [a](DOC:b)', 'podcastDocument').map((d) => [d.name, d.title]), [['Scheda ospite.md', 'Scheda ospite'], ['Gobbo', ''], ['b', 'a']])
    assert.match(studio.render('[Scheda ospite](doc:Scheda ospite.md)'), /<button type="button" class="podcast-document" data-document="Scheda ospite.md" data-title="Scheda ospite" aria-label="Apri scheda: Scheda ospite.md">▤ Scheda ospite<\/button>/)
    assert.ok(!studio.render('[y](doc:javascript:alert)').includes('href='), 'a document name is never a URL')
    assert.deepEqual(nodes('[titolo](time:5:00)', 'podcastTime').map((t) => [t.title, t.centiseconds]), [['titolo', 30000]], 'titles are accepted in the sample grammar too')
  })
  test('studio options stay linear on hostile input', () => {
    const start = performance.now()
    for (const source of ['#a'.repeat(50000), '[](doc:'.repeat(20000), '-[]'.repeat(20000), 'a\n'.repeat(20000), '- [ ] a\n'.repeat(10000), '#'.repeat(100000), '@'.repeat(100000), '[x](time:'.repeat(20000)]) {
      const root = studio.parse(source)
      getPodcastSummary(root)
      taskRanges(source, root)
    }
    assert.ok(performance.now() - start < budget(2000))
  })
})
