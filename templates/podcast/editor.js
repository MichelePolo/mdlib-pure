// A small application around the public parser/render API. The custom plugin
// knows nothing about the editor, localStorage, document tabs or autocomplete.
import { createMarkdown } from '../../src/index.ts'
import { gfm } from '../../src/gfm/index.ts'
import { durationLabel, formatClock, formatDuration, getPodcastSummary, PARTICIPANTS, parseClock, parseDuration, podcast, taskRanges } from './plugin.ts'
const EPISODE = 'Scaletta'

/** Mount into the source-controlled podcast markup. Returns an instance with
 * explicit state and cleanup; persistence is opt-in and scoped by storageKey.
 *
 * Hosting options (an application that keeps the rundown on its own server):
 * - grammar: options of podcast() (durations, tags, lineBlocks, looseTasks); tagColors: fixed colours by name;
 * - tasks: 'edit' (a click rewrites the source) or 'notify' (only onTaskToggle({ document, id, checked, line, box }));
 * - documents: 'local' (tabs and local documents) or 'host' (a document button only calls onOpenDocument({ name, title }));
 * - readOnly (preview only, controls stay live), compact (no header, legend, status), current (0-based line of the
 *   current point), runningTimer ({ line, index, text? }: text, e.g. a countdown, replaces the chip's planned value
 *   while it runs); onActiveDocument(name) follows the tabs. */
export function mountPodcastEditor(host, {
  value = {}, participants = PARTICIPANTS, storageKey = null, reset = false, onChange = () => {},
  grammar = {}, tagColors = null, tasks = 'edit', documents: documentMode = 'local', readOnly = false, compact = false,
  current = null, runningTimer = null, onTaskToggle = () => {}, onOpenDocument = () => {}, onActiveDocument = () => {},
} = {}) {
  const lifetime = new AbortController()
  const on = (target, type, listener) => target.addEventListener(type, listener, { signal: lifetime.signal })
  let people = participantNames(participants)
  const initial = normalizeState(value)
  let total = 0
  const $ = (selector) => host.querySelector(selector)
  const input = $('#podcast-input')
  const preview = $('#podcast-preview')
  const suggestions = $('#podcast-mentions')
  const clock = grammar.durations === 'clock'
  // Blocks carry their source line (0-based) and how many lines they span, so the host can point at a line.
  const blockAttributes = (node) => {
    if (!node.position || (node.type !== 'paragraph' && node.type !== 'heading' && node.type !== 'listItem')) return null
    const attrs = { 'data-line': node.position.start.line - 1, 'data-lines': node.position.end.line - node.position.start.line + 1 }
    if (node.podcastDone) attrs.class = 'is-done'
    return attrs
  }
  const parser = () => createMarkdown({
    plugins: [...gfm(), podcast({ ...grammar, participants: people, tags: { ...(grammar.tags ?? {}), colors: tagColors ?? grammar.tags?.colors ?? undefined } })],
    positions: true,
    attributes: blockAttributes,
  })
  let md = parser()
  host.dataset.tasks = tasks
  host.dataset.documents = documentMode
  host.dataset.durations = clock ? 'clock' : 'centiseconds'
  host.toggleAttribute('data-readonly', readOnly)
  host.toggleAttribute('data-compact', compact)
  current = Number.isInteger(current) ? current : null
  if (clock) $('#podcast-time-dialog p').textContent = 'Il tempo previsto per questo punto, in minuti e secondi. Il titolo è facoltativo.'
  const STORAGE = storageKey
  let documents = initial.documents
  let active = initial.active
  let storageAvailable = true
  try {
    const stored = STORAGE ? JSON.parse(localStorage.getItem(STORAGE) ?? 'null') : null
    if (Array.isArray(stored?.documents) && stored.documents.length <= 100 && stored.documents.every((entry) => Array.isArray(entry) && entry.length === 2 && validName(entry[0]) && typeof entry[1] === 'string')) {
      const restored = new Map(stored.documents)
      if (restored.has(EPISODE)) { documents = restored; active = restored.has(stored.active) ? stored.active : EPISODE }
    }
  } catch { storageAvailable = false }
  const histories = new Map()
  const selections = new Map()
  let ranges = new Map()
  let mention = null
  let savedSelection = [0, 0]
  let persistTimer

  function validName(name) {
    return typeof name === 'string' && name.trim() === name && name.length > 0 && name.length <= 160 && !name.startsWith('doc:') && !/[()\\\x00-\x1f]/.test(name)
  }
  function announce(message) { $('#podcast-notice').textContent = message }
  function persist() {
    clearTimeout(persistTimer)
    if (!STORAGE) { $('#podcast-save').textContent = 'Modifiche disponibili all’applicazione'; return }
    try { localStorage.setItem(STORAGE, JSON.stringify({ documents: [...documents], active })); storageAvailable = true }
    catch { storageAvailable = false }
    $('#podcast-save').textContent = storageAvailable ? 'Salvato in questo browser' : 'Solo in questa sessione'
  }
  function saveSoon() {
    onChange(getState())
    $('#podcast-save').textContent = STORAGE ? 'Salvataggio…' : 'Modifiche disponibili all’applicazione'
    clearTimeout(persistTimer)
    persistTimer = setTimeout(persist, 250)
  }
  if (STORAGE) on(window, 'pagehide', persist)

  function currentHistory() {
    if (!histories.has(active)) histories.set(active, { index: 0, entries: [{ value: documents.get(active), start: 0, end: 0 }] })
    return histories.get(active)
  }
  function rememberSelection() {
    selections.set(active, [input.selectionStart, input.selectionEnd, input.scrollTop, preview.scrollTop])
    const h = currentHistory()
    if (h.entries[h.index].value === input.value) Object.assign(h.entries[h.index], { start: input.selectionStart, end: input.selectionEnd })
  }
  function record() {
    const h = currentHistory()
    if (h.entries[h.index].value === input.value) return
    h.entries.splice(h.index + 1)
    h.entries.push({ value: input.value, start: input.selectionStart, end: input.selectionEnd })
    if (h.entries.length > 200) h.entries.shift()
    h.index = h.entries.length - 1
  }
  function changed() {
    record()
    documents.set(active, input.value)
    render()
    saveSoon()
  }
  function replace(text, start = input.selectionStart, end = input.selectionEnd, selection = null) {
    rememberSelection()
    input.setRangeText(text, start, end, 'end')
    if (selection) input.setSelectionRange(start + selection[0], start + selection[1])
    input.focus()
    changed()
    closeMentions()
  }
  function historyStep(delta) {
    const h = currentHistory()
    const index = h.index + delta
    if (index < 0 || index >= h.entries.length) return
    h.index = index
    const entry = h.entries[index]
    input.value = entry.value
    input.setSelectionRange(entry.start, entry.end)
    documents.set(active, input.value)
    input.focus()
    closeMentions()
    render()
    saveSoon()
  }
  function render() {
    const scroll = preview.scrollTop
    const root = md.parse(input.value)
    md.renderTo(preview, root)
    ranges = taskRanges(input.value, root)
    for (const check of preview.querySelectorAll('[data-task]')) check.disabled = tasks === 'notify' ? check.dataset.line === undefined : !ranges.has(Number(check.dataset.task))
    applyMarks()
    preview.scrollTop = scroll
    const summary = getPodcastSummary(active === EPISODE ? root : md.parse(documents.get(EPISODE)))
    total = summary.centiseconds
    $('#podcast-total').textContent = clock ? formatClock(Math.round(summary.centiseconds / 100)) : formatDuration(summary.centiseconds)
    $('#podcast-total-label').textContent = `${durationLabel(summary.centiseconds)} · durata indicativa`
    const progress = getPodcastSummary(root)
    $('#podcast-progress').textContent = `${progress.completed} di ${progress.tasks} interventi completati`
    $('#podcast-length').textContent = `${input.value.length.toLocaleString('it-IT')} caratteri`
    $('#podcast-source-name').textContent = active
    $('#podcast-panel').setAttribute('aria-label', active)
    $('#podcast-hint').textContent = active === EPISODE ? 'Scrivi @ per scegliere una voce' : 'Scheda di supporto · durata esclusa dal totale episodio'
    announce(progress.invalid ? (clock ? 'Durata non valida: usa [titolo](time:minuti:secondi), ore:minuti:secondi, 5m o 90s.' : 'Durata non valida: usa [](time:minuti:secondi:centesimi), con secondi da 00 a 59.') : '')
    const h = currentHistory()
    $('[data-action="undo"]').disabled = h.index === 0
    $('[data-action="redo"]').disabled = h.index === h.entries.length - 1
  }
  function renderTabs() {
    const tabs = $('#podcast-tabs')
    tabs.replaceChildren()
    for (const name of documents.keys()) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = name
      button.setAttribute('role', 'tab')
      button.setAttribute('aria-selected', String(name === active))
      button.setAttribute('aria-controls', 'podcast-panel')
      button.tabIndex = name === active ? 0 : -1
      button.addEventListener('click', () => openDocument(name))
      tabs.append(button)
    }
  }
  function openDocument(name) {
    rememberSelection()
    documents.set(active, input.value)
    if (!documents.has(name)) documents.set(name, `# ${name}\n\n`)
    active = name
    input.value = documents.get(name)
    currentHistory()
    const [start, end, scroll, previewScroll] = selections.get(name) ?? [0, 0, 0, 0]
    input.setSelectionRange(start, end)
    closeMentions()
    renderTabs()
    render()
    input.scrollTop = scroll
    preview.scrollTop = previewScroll
    input.focus()
    saveSoon()
    onActiveDocument(active)
  }
  // The current point and the running timer are marks the host sets: classes on the rendered blocks and chips.
  function applyMarks() {
    for (const el of preview.querySelectorAll('.is-current, .is-running, .is-over')) el.classList.remove('is-current', 'is-running', 'is-over')
    if (current !== null) {
      let best = null
      for (const el of preview.querySelectorAll(':is(p, h1, h2, h3, h4, h5, h6, li)[data-line]')) {
        const start = Number(el.dataset.line)
        if (start <= current && current < start + Number(el.dataset.lines ?? 1) && (!best || start >= Number(best.dataset.line))) best = el
      }
      best?.classList.add('is-current')
    }
    for (const clock of preview.querySelectorAll('.podcast-clock')) clock.textContent = clock.dataset.planned ?? clock.textContent
    if (!runningTimer) return
    const chip = preview.querySelector(`.podcast-time[data-line="${Number(runningTimer.line)}"][data-timer="${Number(runningTimer.index)}"]`)
    if (!chip) return
    chip.classList.add('is-running')
    if (typeof runningTimer.text !== 'string') return
    chip.querySelector('.podcast-clock').textContent = runningTimer.text
    chip.classList.toggle('is-over', /^[-−]/.test(runningTimer.text.trim()))
  }
  on($('#podcast-tabs'), 'keydown', (event) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const names = [...documents.keys()]
    const at = names.indexOf(active)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length
    openDocument(names[next])
    $('#podcast-tabs [aria-selected="true"]').focus()
  })
  on(preview, 'click', (event) => {
    const documentButton = event.target.closest('[data-document]')
    if (documentButton) {
      if (documentMode === 'host') onOpenDocument({ name: documentButton.dataset.document, title: documentButton.dataset.title ?? documentButton.dataset.document })
      else openDocument(documentButton.dataset.document)
      return
    }
    const check = event.target.closest('[data-task]')
    if (!check || check.disabled) return
    if (tasks === 'notify') {
      onTaskToggle({ document: active, id: Number(check.dataset.task), checked: check.getAttribute('aria-checked') !== 'true', line: Number(check.dataset.line), box: Number(check.dataset.box) })
      return
    }
    const range = ranges.get(Number(check.dataset.task))
    if (!range) return
    const selection = [input.selectionStart, input.selectionEnd]
    replace(check.getAttribute('aria-checked') === 'true' ? '[ ]' : '[x]', ...range)
    input.setSelectionRange(...selection)
    preview.querySelector(`[data-task="${check.dataset.task}"]`)?.focus()
  })

  function closeMentions() {
    mention = null
    suggestions.hidden = true
    input.removeAttribute('aria-activedescendant')
  }
  function showMentions() {
    const end = input.selectionStart
    if (end !== input.selectionEnd) { closeMentions(); return }
    let start = end
    while (start > 0 && end - start < 33 && /[\p{L}\p{N}_-]/u.test(input.value[start - 1])) start--
    start--
    if (input.value[start] !== '@' || (start > 0 && /[\p{L}\p{N}_.+%\-]/u.test(input.value[start - 1]))) { closeMentions(); return }
    const query = input.value.slice(start + 1, end).toLowerCase()
    const matches = people.filter((name) => name.toLowerCase().startsWith(query))
    if (!matches.length) { closeMentions(); return }
    let tail = end
    while (tail < input.value.length && tail - start <= 33 && /[\p{L}\p{N}_-]/u.test(input.value[tail])) tail++
    mention = { start, end: tail, matches, index: 0 }
    suggestions.replaceChildren()
    for (const [i, name] of matches.entries()) {
      const option = document.createElement('button')
      option.type = 'button'
      option.id = `podcast-person-option-${i}`
      option.setAttribute('role', 'option')
      option.tabIndex = -1
      option.textContent = `@${name}`
      option.className = `podcast-person-${people.indexOf(name) % 3}`
      option.addEventListener('mousedown', (event) => event.preventDefault())
      option.addEventListener('click', () => chooseMention(i))
      suggestions.append(option)
    }
    suggestions.hidden = false
    positionMentions()
    selectMention(0)
  }
  function positionMentions() {
    // A temporary text mirror locates the caret without HTML parsing.
    const mirror = document.createElement('div')
    const style = getComputedStyle(input)
    for (const key of ['font', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing', 'wordBreak', 'tabSize']) mirror.style[key] = style[key]
    Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: `${input.clientWidth}px` })
    mirror.textContent = input.value.slice(0, input.selectionStart)
    const marker = document.createElement('span')
    marker.textContent = '|'
    mirror.append(marker)
    $('.podcast-write').append(mirror)
    const x = marker.offsetLeft - input.scrollLeft
    const y = input.offsetTop + marker.offsetTop - input.scrollTop + parseFloat(style.lineHeight)
    suggestions.style.left = `${Math.max(8, Math.min(x, input.clientWidth - 210))}px`
    suggestions.style.top = `${Math.max(input.offsetTop, Math.min(y, $('.podcast-write').clientHeight - suggestions.offsetHeight - 8))}px`
    mirror.remove()
  }
  function selectMention(index) {
    mention.index = (index + mention.matches.length) % mention.matches.length
    for (const [i, option] of [...suggestions.children].entries()) option.setAttribute('aria-selected', String(i === mention.index))
    input.setAttribute('aria-activedescendant', `podcast-person-option-${mention.index}`)
  }
  function chooseMention(index) {
    if (!mention) return
    const { start, end, matches } = mention
    const space = /\s/.test(input.value[end] ?? '') ? '' : ' '
    replace(`@${matches[index]}${space}`, start, end)
  }

  function wrap(before, after = before, placeholder = 'testo') {
    const text = input.value.slice(input.selectionStart, input.selectionEnd) || placeholder
    replace(before + text + after, input.selectionStart, input.selectionEnd, [before.length, before.length + text.length])
  }
  function prefixLines(prefix) {
    const start = input.selectionStart === 0 ? 0 : input.value.lastIndexOf('\n', input.selectionStart - 1) + 1
    const text = input.value.slice(start, input.selectionEnd).split('\n').map((line, i) => prefix(i) + line).join('\n')
    replace(text, start, input.selectionEnd)
  }
  function showDialog(kind) {
    rememberSelection()
    savedSelection = [input.selectionStart, input.selectionEnd]
    closeMentions()
    if (kind === 'document') {
      const list = $('#podcast-document-names')
      list.replaceChildren()
      for (const name of documents.keys()) {
        if (name === EPISODE) continue
        const option = document.createElement('option')
        option.value = name
        list.append(option)
      }
      $('#podcast-document-form').reset()
    }
    if (kind === 'time') {
      const form = $('#podcast-time-form')
      form.reset()
      // Editing a duration under the caret replaces the complete original tag.
      const re = /\[([^[\]\n]{0,160})\]\(time:([^\r\n)]{0,32})\)/g
      for (let match; (match = re.exec(input.value));) {
        if (match.index <= savedSelection[0] && re.lastIndex >= savedSelection[1]) {
          savedSelection = [match.index, re.lastIndex]
          form.elements.title.value = match[1]
          if (clock) {
            const seconds = parseClock(match[2])
            if (seconds !== null) { form.elements.minutes.value = Math.floor(seconds / 60); form.elements.seconds.value = seconds % 60 }
            break
          }
          const value = parseDuration(match[2])
          if (value !== null) {
            form.elements.minutes.value = Math.floor(value / 6000)
            form.elements.seconds.value = Math.floor(value / 100) % 60
            form.elements.centiseconds.value = value % 100
          }
          break
        }
      }
    }
    if (kind === 'link') {
      $('#podcast-link-form').reset()
      $('#podcast-link-form').elements.label.value = input.value.slice(...savedSelection) || 'link'
    }
    $(`#podcast-${kind}-dialog`).showModal()
  }
  for (const dialog of host.querySelectorAll('dialog')) {
    on(dialog.querySelector('[data-close]'), 'click', () => dialog.close())
    on(dialog, 'close', () => input.focus())
  }
  on($('#podcast-time-form'), 'submit', (event) => {
    event.preventDefault()
    const fields = event.target.elements
    const title = fields.title.value.trim().replace(/[\\[\]]/g, '\\$&')
    if (clock) {
      const value = `${Number(fields.minutes.value)}:${String(Number(fields.seconds.value)).padStart(2, '0')}`
      if (parseClock(value) === null) return
      $('#podcast-time-dialog').close()
      replace(`[${title}](time:${value})`, ...savedSelection)
      return
    }
    const value = `${Number(fields.minutes.value)}:${String(Number(fields.seconds.value)).padStart(2, '0')}:${String(Number(fields.centiseconds.value)).padStart(2, '0')}`
    if (parseDuration(value) === null) return
    $('#podcast-time-dialog').close()
    replace(`[${title}](time:${value})`, ...savedSelection)
  })
  on($('#podcast-document-form').elements.document, 'input', (event) => event.target.setCustomValidity(''))
  on($('#podcast-document-form'), 'submit', (event) => {
    event.preventDefault()
    const field = event.target.elements.document
    const name = field.value.trim()
    if (!validName(name) || name === EPISODE) { field.setCustomValidity('Scegli un nome senza parentesi, barre inverse o prefisso doc:, diverso da Scaletta.'); field.reportValidity(); return }
    $('#podcast-document-dialog').close()
    if (documentMode === 'host') { replace(`[${name.replace(/[\\[\]]/g, '\\$&')}](doc:${name})`, ...savedSelection); return }
    replace(`[scheda](${name})`, ...savedSelection)
    openDocument(name)
  })
  on($('#podcast-link-form'), 'submit', (event) => {
    event.preventDefault()
    const { label, url } = event.target.elements
    const text = label.value.replace(/[\\[\]]/g, '\\$&')
    const destination = url.value.replace(/[()<>\s]/g, (char) => encodeURIComponent(char))
    $('#podcast-link-dialog').close()
    replace(`[${text}](${destination})`, ...savedSelection)
  })

  const actions = new Map([
    ['bold', () => wrap('**')], ['underline', () => wrap('_')],
    ['heading', () => prefixLines(() => '## ')], ['bullet', () => prefixLines(() => '- ')],
    ['number', () => prefixLines((i) => `${i + 1}. `)], ['task', () => prefixLines(() => '[ ] ')],
    ['mention', () => { if (!mention) replace('@'); showMentions() }],
    ['time', () => showDialog('time')], ['document', () => showDialog('document')], ['link', () => showDialog('link')],
    ['undo', () => historyStep(-1)], ['redo', () => historyStep(1)],
    ['reset', () => {
      if (!confirm('Ripristinare l’esempio? Le modifiche locali a scaletta e schede verranno sostituite.')) return
      const original = normalizeState(value); documents = original.documents; histories.clear(); selections.clear(); active = original.active
      input.value = documents.get(active); closeMentions(); renderTabs(); render(); saveSoon()
    }],
  ])
  for (const button of host.querySelectorAll('[data-action]')) on(button, 'click', () => actions.get(button.dataset.action)?.())
  for (const button of host.querySelectorAll('button[data-view]')) on(button, 'click', () => {
    host.dataset.view = button.dataset.view
    for (const item of host.querySelectorAll('button[data-view]')) item.setAttribute('aria-pressed', String(item === button))
    closeMentions()
  })
  on(input, 'beforeinput', rememberSelection)
  on(input, 'select', rememberSelection)
  on(input, 'input', (event) => { changed(); if (!event.isComposing) showMentions() })
  on(input, 'compositionend', showMentions)
  on(input, 'click', showMentions)
  on(input, 'blur', (event) => { if (!suggestions.contains(event.relatedTarget)) closeMentions() })
  on(input, 'scroll', () => { if (mention) positionMentions() })
  on(input, 'keydown', (event) => {
    if (event.isComposing) return
    if (mention && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
      event.preventDefault()
      if (event.key === 'Escape') closeMentions()
      else if (event.key === 'Enter' || event.key === 'Tab') chooseMention(mention.index)
      else selectMention(mention.index + (event.key === 'ArrowDown' ? 1 : -1))
      return
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    const key = event.key.toLowerCase()
    const action = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : new Map([['b', 'bold'], ['u', 'underline'], ['k', 'link']]).get(key)
    if (action) { event.preventDefault(); actions.get(action)() }
  })

  const divider = $('.podcast-divider')
  function setSplit(percent) {
    const value = Math.round(Math.max(25, Math.min(75, percent)))
    $('.podcast-panes').style.setProperty('--podcast-split', `${value}%`)
    divider.setAttribute('aria-valuenow', String(value))
  }
  on(divider, 'pointerdown', (event) => { divider.setPointerCapture(event.pointerId); event.preventDefault() })
  on(divider, 'pointermove', (event) => {
    if (!divider.hasPointerCapture(event.pointerId)) return
    const bounds = $('.podcast-panes').getBoundingClientRect()
    setSplit((event.clientX - bounds.left) / bounds.width * 100)
  })
  on(divider, 'keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    setSplit(Number(divider.getAttribute('aria-valuenow')) + (event.key === 'ArrowLeft' ? -5 : 5))
  })

  input.value = documents.get(active)
  currentHistory()
  renderTabs()
  render()
  $('#podcast-save').textContent = !STORAGE ? 'Pronto' : storageAvailable ? 'Bozza locale · salvataggio automatico' : 'Solo in questa sessione'
  $('[data-action="reset"]').hidden = !reset
  renderPeople()
  return {
    getState,
    setState(next) {
      const state = normalizeState(next)
      documents = state.documents; active = state.active
      histories.clear(); selections.clear(); closeMentions()
      input.value = documents.get(active)
      renderTabs(); render()
    },
    setParticipants(next = PARTICIPANTS) {
      people = participantNames(next)
      md = parser()
      closeMentions(); renderPeople(); render()
    },
    setTagColors(next) { tagColors = next ?? null; md = parser(); render() },
    setReadOnly(next) { host.toggleAttribute('data-readonly', !!next); closeMentions() },
    setCurrent(line) { current = Number.isInteger(line) ? line : null; applyMarks() },
    setRunningTimer(next) { runningTimer = next && Number.isInteger(next.line) && Number.isInteger(next.index) ? { line: next.line, index: next.index, text: typeof next.text === 'string' ? next.text : undefined } : null; applyMarks() },
    setView(view) {
      host.dataset.view = ['split', 'write', 'preview'].includes(view) ? view : 'split'
      for (const button of host.querySelectorAll('button[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === host.dataset.view))
    },
    destroy() {
      clearTimeout(persistTimer)
      lifetime.abort()
      for (const dialog of host.querySelectorAll('dialog[open]')) dialog.close()
    },
  }
  function getState() {
    return { source: documents.get(EPISODE), documents: Object.fromEntries([...documents].filter(([name]) => name !== EPISODE)), activeDocument: active, durationCentiseconds: total }
  }
  function normalizeState(state) {
    const entries = Object.entries(state?.documents ?? {}).filter(([name, source]) => name !== EPISODE && validName(name) && typeof source === 'string')
    const documents = new Map([[EPISODE, typeof state?.source === 'string' ? state.source : ''], ...entries])
    return { documents, active: documents.has(state?.activeDocument) ? state.activeDocument : EPISODE }
  }
  function participantNames(names) {
    const unique = new Map()
    for (const name of Array.isArray(names) ? names : []) {
      if (typeof name === 'string' && /^[\p{L}\p{N}_-]{1,32}$/u.test(name) && !unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name)
      if (unique.size === 100) break
    }
    return [...unique.values()]
  }
  function renderPeople() {
    const list = $('.podcast-people')
    for (const badge of list.querySelectorAll('.podcast-mention')) badge.remove()
    for (const [i, name] of people.entries()) {
      const badge = document.createElement('span')
      badge.className = `podcast-mention podcast-person-${i % 3}`
      badge.textContent = `@${name}`
      list.append(badge)
    }
    const examples = host.querySelectorAll('.podcast-legend code')
    examples[0].textContent = `@${people[0] ?? 'Nome'}`
    examples[2].textContent = '[scheda](Appunti)'
    $('#podcast-document-form').elements.document.placeholder = 'Es. Appunti'
  }
}
