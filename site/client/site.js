// Every page: colour scheme select, copy buttons, announcements.
// The stored scheme is applied before first paint by an inline script in
// <head>; this keeps the selects, the <meta> and other tabs in sync.
const KEY = 'color-scheme'
const meta = document.querySelector('meta[name="color-scheme"]')

function stored() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'light dark'
  } catch {
    return meta.content
  }
}

function apply(value) {
  meta.content = value
  for (const select of document.querySelectorAll('select[data-scheme]')) select.value = value
}

for (const select of document.querySelectorAll('select[data-scheme]')) {
  select.value = meta.content
  select.addEventListener('change', () => {
    try {
      if (select.value === 'light dark') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, select.value)
    } catch {
      // Storage blocked: the choice still applies to this page.
    }
    apply(select.value)
  })
}
addEventListener('storage', (e) => {
  if (e.key === KEY || e.key === null) apply(stored())
})

// A polite live region for short confirmations ("Copied").
const live = document.createElement('p')
live.className = 'visually-hidden'
live.setAttribute('role', 'status')
document.body.append(live)
export function announce(text) {
  live.textContent = ''
  requestAnimationFrame(() => (live.textContent = text))
}

async function copy(text, button) {
  const label = button.textContent
  try {
    await navigator.clipboard.writeText(text)
    button.textContent = 'Copied'
    announce('Copied to the clipboard')
  } catch {
    button.textContent = 'Copy failed'
  }
  setTimeout(() => (button.textContent = label), 1600)
}

for (const button of document.querySelectorAll('button[data-copy]')) {
  button.addEventListener('click', () => copy(button.dataset.copy, button))
}

// Copy buttons on code blocks of rendered Markdown (not in the playground).
for (const pre of document.querySelectorAll('.md pre:not(.pg-code pre)')) {
  if (pre.closest('.pane-src, .pg-panel')) continue
  const wrap = document.createElement('div')
  wrap.className = 'code-wrap'
  pre.replaceWith(wrap)
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'copy'
  button.textContent = 'Copy'
  button.setAttribute('aria-label', 'Copy the code')
  button.addEventListener('click', () => copy(pre.textContent, button))
  wrap.append(pre, button)
}

// The mobile menu is a popover: close it when a link inside is followed.
const nav = document.getElementById('site-nav')
nav?.addEventListener('click', (e) => {
  if (e.target.closest('a') && nav.matches(':popover-open')) nav.hidePopover()
})
