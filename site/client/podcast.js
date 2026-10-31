// A small application around the public parser/render API. The custom plugin
// knows nothing about the editor, localStorage, document tabs or autocomplete.
import { createMarkdown } from '../../src/index.ts'
import { gfm } from '../../src/gfm/index.ts'
import { durationLabel, formatDuration, getPodcastSummary, PARTICIPANTS, parseDuration, podcast, taskRanges } from '../../templates/podcast/plugin.ts'
import { EPISODE, INITIAL_DOCUMENTS } from '../lib/podcast-data.js'

const host = document.querySelector('.podcast')
const $ = (selector) => host.querySelector(selector)
const input = $('#podcast-input')
const preview = $('#podcast-preview')
const suggestions = $('#podcast-mentions')
const md = createMarkdown({ plugins: [...gfm(), podcast()], positions: true })
const STORAGE = 'mdlib-podcast-sample-v2'
let documents = new Map(INITIAL_DOCUMENTS)
let active = EPISODE
let storageAvailable = true
try {
  const stored = JSON.parse(localStorage.getItem(STORAGE) ?? 'null')
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
  try { localStorage.setItem(STORAGE, JSON.stringify({ documents: [...documents], active })); storageAvailable = true }
  catch { storageAvailable = false }
  $('#podcast-save').textContent = storageAvailable ? 'Salvato in questo browser' : 'Solo in questa sessione'
}
function saveSoon() {
  $('#podcast-save').textContent = 'Salvataggio…'
  clearTimeout(persistTimer)
  persistTimer = setTimeout(persist, 250)
}
window.addEventListener('pagehide', persist)

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
  for (const check of preview.querySelectorAll('[data-task]')) check.disabled = !ranges.has(Number(check.dataset.task))
  preview.scrollTop = scroll
  const summary = getPodcastSummary(active === EPISODE ? root : md.parse(documents.get(EPISODE)))
  $('#podcast-total').textContent = formatDuration(summary.centiseconds)
  $('#podcast-total-label').textContent = `${durationLabel(summary.centiseconds)} · durata indicativa`
  const current = getPodcastSummary(root)
  $('#podcast-progress').textContent = `${current.completed} di ${current.tasks} interventi completati`
  $('#podcast-length').textContent = `${input.value.length.toLocaleString('it-IT')} caratteri`
  $('#podcast-source-name').textContent = active
  $('#podcast-panel').setAttribute('aria-label', active)
  $('#podcast-hint').textContent = active === EPISODE ? 'Scrivi @ per scegliere una voce' : 'Scheda di supporto · durata esclusa dal totale episodio'
  announce(current.invalid ? 'Durata non valida: usa [](time:minuti:secondi:centesimi), con secondi da 00 a 59.' : '')
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
}
$('#podcast-tabs').addEventListener('keydown', (event) => {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const names = [...documents.keys()]
  const at = names.indexOf(active)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length
  openDocument(names[next])
  $('#podcast-tabs [aria-selected="true"]').focus()
})
preview.addEventListener('click', (event) => {
  const documentButton = event.target.closest('[data-document]')
  if (documentButton) { openDocument(documentButton.dataset.document); return }
  const check = event.target.closest('[data-task]')
  const range = check && ranges.get(Number(check.dataset.task))
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
  const matches = PARTICIPANTS.filter((name) => name.toLowerCase().startsWith(query))
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
    option.className = `podcast-person-${PARTICIPANTS.indexOf(name)}`
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
    const re = /\[\]\(time:[^\r\n)]{0,32}\)/g
    for (let match; (match = re.exec(input.value));) {
      if (match.index <= savedSelection[0] && re.lastIndex >= savedSelection[1]) {
        const value = parseDuration(match[0].slice(8, -1))
        savedSelection = [match.index, re.lastIndex]
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
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => input.focus())
}
$('#podcast-time-form').addEventListener('submit', (event) => {
  event.preventDefault()
  const fields = event.target.elements
  const value = `${Number(fields.minutes.value)}:${String(Number(fields.seconds.value)).padStart(2, '0')}:${String(Number(fields.centiseconds.value)).padStart(2, '0')}`
  if (parseDuration(value) === null) return
  $('#podcast-time-dialog').close()
  replace(`[](time:${value})`, ...savedSelection)
})
$('#podcast-document-form').elements.document.addEventListener('input', (event) => event.target.setCustomValidity(''))
$('#podcast-document-form').addEventListener('submit', (event) => {
  event.preventDefault()
  const field = event.target.elements.document
  const name = field.value.trim()
  if (!validName(name) || name === EPISODE) { field.setCustomValidity('Scegli un nome senza parentesi, barre inverse o prefisso doc:, diverso da Scaletta.'); field.reportValidity(); return }
  $('#podcast-document-dialog').close()
  replace(`[scheda](${name})`, ...savedSelection)
  openDocument(name)
})
$('#podcast-link-form').addEventListener('submit', (event) => {
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
    documents = new Map(INITIAL_DOCUMENTS); histories.clear(); selections.clear(); active = EPISODE
    input.value = documents.get(active); closeMentions(); renderTabs(); render(); persist()
  }],
])
for (const button of host.querySelectorAll('[data-action]')) button.addEventListener('click', () => actions.get(button.dataset.action)?.())
for (const button of host.querySelectorAll('button[data-view]')) button.addEventListener('click', () => {
  host.dataset.view = button.dataset.view
  for (const item of host.querySelectorAll('button[data-view]')) item.setAttribute('aria-pressed', String(item === button))
  closeMentions()
})
input.addEventListener('beforeinput', rememberSelection)
input.addEventListener('select', rememberSelection)
input.addEventListener('input', (event) => { changed(); if (!event.isComposing) showMentions() })
input.addEventListener('compositionend', showMentions)
input.addEventListener('click', showMentions)
input.addEventListener('blur', (event) => { if (!suggestions.contains(event.relatedTarget)) closeMentions() })
input.addEventListener('scroll', () => { if (mention) positionMentions() })
input.addEventListener('keydown', (event) => {
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
divider.addEventListener('pointerdown', (event) => { divider.setPointerCapture(event.pointerId); event.preventDefault() })
divider.addEventListener('pointermove', (event) => {
  if (!divider.hasPointerCapture(event.pointerId)) return
  const bounds = $('.podcast-panes').getBoundingClientRect()
  setSplit((event.clientX - bounds.left) / bounds.width * 100)
})
divider.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  setSplit(Number(divider.getAttribute('aria-valuenow')) + (event.key === 'ArrowLeft' ? -5 : 5))
})

input.value = documents.get(active)
currentHistory()
renderTabs()
render()
$('#podcast-save').textContent = storageAvailable ? 'Bozza locale · salvataggio automatico' : 'Solo in questa sessione'
