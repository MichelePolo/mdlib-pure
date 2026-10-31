// Static markup shared by the site page and the Chromium integration tests.
// All user text is inserted by the controller with DOM APIs, never as HTML.
const paths = {
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/>',
  document: '<path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h6"/>',
  check: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',
  link: '<path d="m10 14 4-4M9 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M15 9l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M12 4v16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  undo: '<path d="m9 4-5 5 5 5M4 9h9a7 7 0 0 1 7 7v4"/>',
  redo: '<path d="m15 4 5 5-5 5M20 9h-9a7 7 0 0 0-7 7v4"/>',
}
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${Object.hasOwn(paths, name) ? paths[name] : ''}</svg>`
const tool = (action, label, symbol) => `<button type="button" data-action="${action}" title="${label}" aria-label="${label}">${symbol}</button>`

export function podcastMarkup() {
  return `<section class="podcast" lang="it" aria-label="Editor scaletta podcast" data-view="split">
    <header class="podcast-header">
      <div><p class="podcast-eyebrow"><span class="podcast-dot"></span> EDITOR DEMO / TAG PERSONALIZZATI</p><h1>Scaletta<span class="podcast-title-dot">.</span></h1><p class="podcast-subtitle">Nomi e contenuti di fantasia.</p></div>
      <div class="podcast-total" role="status" aria-live="polite" aria-atomic="true"><span class="podcast-eyebrow">DURATA PREVISTA · EPISODIO</span><div>${icon('clock')} <output id="podcast-total">5:00:00</output></div><span id="podcast-total-label">5 min · durata indicativa</span></div>
    </header>
    <div class="podcast-workspace">
      <div class="podcast-docbar"><div id="podcast-tabs" role="tablist" aria-label="Documenti dell'episodio"></div>${tool('document', 'Aggiungi scheda', icon('plus'))}<span class="podcast-local" id="podcast-save" role="status">Pronto</span></div>
      <div class="podcast-toolbar" role="toolbar" aria-label="Formattazione e tag della scaletta">
        <div class="podcast-toolgroup">${tool('heading', 'Titolo', '<span class="podcast-letter">H</span>')}${tool('bold', 'Grassetto (Ctrl+B)', '<b>B</b>')}${tool('underline', 'Sottolineato (Ctrl+U)', '<u>U</u>')}${tool('bullet', 'Elenco puntato', '≡')}${tool('number', 'Elenco numerato', '<span>1.</span>')}${tool('link', 'Inserisci link (Ctrl+K)', icon('link'))}</div>
        <div class="podcast-toolgroup podcast-custom">${tool('task', 'Checkbox', icon('check'))}${tool('mention', 'Partecipante', '<span class="podcast-at">@</span>')}${tool('time', 'Durata della sezione', icon('clock'))}${tool('document', 'Collega documento', icon('document'))}</div>
        <div class="podcast-toolgroup podcast-history">${tool('undo', 'Annulla (Ctrl+Z)', icon('undo'))}${tool('redo', 'Ripeti (Ctrl+Shift+Z)', icon('redo'))}</div>
        <div class="podcast-views" role="group" aria-label="Vista editor"><button type="button" data-view="write" aria-pressed="false">Scrivi</button><button type="button" data-view="split" aria-pressed="true">${icon('split')} Split</button><button type="button" data-view="preview" aria-pressed="false">Leggi</button></div>
      </div>
      <div class="podcast-panes" id="podcast-panel" role="tabpanel" aria-label="Scaletta">
        <section class="podcast-write"><header class="podcast-pane-label"><span>MARKDOWN</span><span id="podcast-source-name">Scaletta</span></header>
          <textarea id="podcast-input" aria-label="Sorgente Markdown" spellcheck="false" aria-autocomplete="list" aria-controls="podcast-mentions" aria-describedby="podcast-hint"></textarea>
          <div id="podcast-mentions" role="listbox" aria-label="Partecipanti" hidden></div>
        </section>
        <div class="podcast-divider" role="separator" tabindex="0" aria-label="Ridimensiona pannelli" aria-orientation="vertical" aria-valuemin="25" aria-valuemax="75" aria-valuenow="50"></div>
        <section class="podcast-read"><header class="podcast-pane-label"><span>ANTEPRIMA</span><span><span class="podcast-dot"></span> LIVE</span></header><div id="podcast-preview" class="md" role="region" aria-label="Anteprima documento"></div></section>
      </div>
      <footer class="podcast-status"><span id="podcast-progress">2 di 3 interventi completati</span><span id="podcast-hint">Scrivi @ per scegliere una voce</span><span id="podcast-length"></span></footer>
    </div>
    <div class="podcast-below"><div class="podcast-people"><span>LE VOCI</span><span class="podcast-mention podcast-person-0">@Nora</span><span class="podcast-mention podcast-person-1">@Elio</span><span class="podcast-mention podcast-person-2">@Vera</span></div><button type="button" data-action="reset">Ripristina esempio</button></div>
    <details class="podcast-legend"><summary>La sintassi, a colpo d’occhio <span>↗</span></summary><dl><div><dt><code>@Vera</code></dt><dd>Una voce, scelta dalla lista.</dd></div><div><dt><code>[](time:5:00:00)</code></dt><dd>5 minuti per la sezione. Il totale somma i tag della scaletta.</dd></div><div><dt><code>[scheda](Gobbo Vera)</code></dt><dd>Un documento separato, modificabile in una scheda.</dd></div><div><dt><code>[ ] / [x]</code></dt><dd>Intervento da fare o completato. Clicca anche nell’anteprima.</dd></div><div><dt><code>**grassetto** / _sottolineato_</code></dt><dd>Formattazione della vostra scaletta.</dd></div></dl></details>
    <p class="podcast-notice" id="podcast-notice" role="status" aria-live="polite"></p>
    <dialog id="podcast-time-dialog"><form id="podcast-time-form"><h2>Durata della sezione</h2><p>Una stima per questo intervento, in minuti, secondi e centesimi.</p><div class="podcast-time-fields"><label>Minuti<input name="minutes" type="number" min="0" max="999999" step="1" value="5" required></label><label>Secondi<input name="seconds" type="number" min="0" max="59" step="1" value="0" required></label><label>Centesimi<input name="centiseconds" type="number" min="0" max="99" step="1" value="0" required></label></div><footer><button type="button" data-close>Annulla</button><button type="submit" class="podcast-primary">Inserisci durata</button></footer></form></dialog>
    <dialog id="podcast-document-dialog"><form id="podcast-document-form"><h2>Collega una scheda</h2><p>Scegli un documento esistente o scrivi il nome di uno nuovo.</p><label>Nome documento<input name="document" list="podcast-document-names" maxlength="160" required autocomplete="off" placeholder="Es. Gobbo Nora"></label><datalist id="podcast-document-names"></datalist><footer><button type="button" data-close>Annulla</button><button type="submit" class="podcast-primary">Collega e apri</button></footer></form></dialog>
    <dialog id="podcast-link-dialog"><form id="podcast-link-form"><h2>Inserisci un link</h2><label>Testo<input name="label" required value="link"></label><label>Indirizzo<input name="url" type="url" required placeholder="https://…"></label><footer><button type="button" data-close>Annulla</button><button type="submit" class="podcast-primary">Inserisci link</button></footer></form></dialog>
  </section>`
}
