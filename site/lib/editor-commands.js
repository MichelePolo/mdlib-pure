// Shared toolbar catalog: insertion templates are data, never executable markup.
export const COMMANDS = [
  ...[1,2,3,4,5,6].map(n => ({ id: `h${n}`, label: `Titolo ${n}`, icon: `H${n}`, before: '#'.repeat(n) + ' ', placeholder: 'Titolo', block: true, group: 'Titoli' })),
  { id: 'bold', label: 'Grassetto (Ctrl+B)', icon: 'B', before: '**', after: '**', group: 'Testo' },
  { id: 'italic', label: 'Corsivo (Ctrl+I)', icon: 'I', before: '*', after: '*', group: 'Testo' },
  { id: 'strike', label: 'Barrato', icon: 'S̶', before: '~~', after: '~~', plugin: 'gfm', group: 'Testo' },
  { id: 'mark', label: 'Evidenziato', icon: '▰', before: '==', after: '==', plugin: 'mark', group: 'Testo' },
  { id: 'code', label: 'Codice inline', icon: '</>', before: '`', after: '`', group: 'Testo' },
  { id: 'link', label: 'Collegamento', icon: '↗', before: '[', after: '](https://example.com)', group: 'Inserisci' },
  { id: 'image', label: 'Immagine', icon: '▧', before: '![', after: '](https://placehold.co/640x320/png)', placeholder: 'Descrizione immagine', group: 'Inserisci' },
  { id: 'quote', label: 'Citazione', icon: '❞', before: '> ', block: true, lines: true, group: 'Blocchi' },
  { id: 'bullet', label: 'Elenco puntato', icon: '• ≡', before: '- ', block: true, lines: true, group: 'Blocchi' },
  { id: 'ordered', label: 'Elenco numerato', icon: '1.', before: '1. ', block: true, lines: true, group: 'Blocchi' },
  { id: 'task', label: 'Lista attività', icon: '☑', before: '- [ ] ', block: true, lines: true, plugin: 'gfm', group: 'Blocchi' },
  { id: 'rule', label: 'Separatore', icon: '―', template: '---', block: true, group: 'Blocchi' },
  { id: 'fence', label: 'Blocco di codice', icon: '{ }', before: '```js\n', after: '\n```', block: true, placeholder: 'const hello = "world"', group: 'Blocchi' },
  { id: 'table', label: 'Tabella', icon: '▦', template: '| Colonna | Valore |\n| :--- | ---: |\n| Riga | 42 |', block: true, plugin: 'gfm', group: 'Avanzati' },
  { id: 'footnote', label: 'Nota a piè di pagina', icon: '[1]', before: '', after: '[^nota]\n\n[^nota]: Testo della nota.', plugin: 'gfm', group: 'Avanzati' },
  ...['NOTE','TIP','IMPORTANT','WARNING','CAUTION'].map(kind => ({ id: `alert-${kind}`, label: `Avviso ${kind}`, icon: ({ NOTE: 'ⓘ', TIP: '✧', IMPORTANT: '‼', WARNING: '⚠', CAUTION: '⊘' })[kind], before: `> [!${kind}]\n> `, block: true, plugin: 'gfm', group: 'Avvisi' })),
  { id: 'container', label: 'Contenitore', icon: '▣', before: '::: note Titolo\n', after: '\n:::', block: true, plugin: 'container', group: 'Avanzati' },
  { id: 'definition', label: 'Definizione', icon: '≔', template: 'Termine\n: Definizione', block: true, plugin: 'deflist', group: 'Avanzati' },
  { id: 'math', label: 'Formula inline', icon: 'ƒ', before: '$', after: '$', placeholder: 'E = mc^2', plugin: 'math', group: 'Avanzati' },
  { id: 'equation', label: 'Formula a blocco', icon: '∑', before: '$$\n', after: '\n$$', placeholder: 'E = mc^2', block: true, plugin: 'math', group: 'Avanzati' },
  { id: 'mermaid', label: 'Diagramma Mermaid', icon: '◇', template: '```mermaid\nflowchart LR\n  Scrivi --> Anteprima --> Esporta\n```', block: true, plugin: 'mermaid', group: 'Avanzati' },
  { id: 'yaml', label: 'Metadati YAML', icon: '---', template: '---\ntitle: Il mio documento\nauthor: Autore\n---\n\n', start: true, plugin: 'frontmatter', group: 'Metadati' },
  { id: 'toml', label: 'Metadati TOML', icon: '+++', template: '+++\ntitle = "Il mio documento"\n+++\n\n', start: true, plugin: 'frontmatter', group: 'Metadati' },
  { id: 'break', label: 'Interruzione di riga', icon: '↵', template: '  \n', group: 'Inserisci' },
  { id: 'escape', label: 'Escape carattere', icon: '\\', before: '\\', placeholder: '*', group: 'Inserisci' },
  { id: 'reference', label: 'Collegamento con riferimento', icon: '↗¹', before: '[', after: '][riferimento]\n\n[riferimento]: https://example.com', group: 'Inserisci' },
  { id: 'entity', label: 'Entità HTML', icon: '&', template: '&copy;', group: 'Inserisci' },
  { id: 'autolink', label: 'URL automatico', icon: '@', template: '<https://example.com>', group: 'Inserisci' },
]

export function insertCommand(value, start, end, command) {
  if (command.start) start = end = 0
  const selected = value.slice(start, end) || command.placeholder || 'Testo'
  let body = command.template ?? (command.before + (command.lines ? selected.split('\n').join('\n' + command.before) : selected) + (command.after ?? ''))
  const prefix = command.block && start > 0 ? (value[start - 1] === '\n' ? '\n' : '\n\n') : ''
  const suffix = command.block ? '\n\n' : ''
  const inserted = prefix + body + suffix
  return { value: value.slice(0, start) + inserted + value.slice(end), start: start + prefix.length, end: start + prefix.length + body.length }
}
