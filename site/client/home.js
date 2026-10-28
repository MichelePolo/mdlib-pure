// Home hero: the live example, rendered by the library bundled from src/.
import { createMarkdown } from '../../src/index.ts'
import { gfm } from '../../src/gfm/index.ts'
import { mark } from '../../src/plugins/mark.ts'

const md = createMarkdown({ plugins: [...gfm(), mark()] })
const src = document.getElementById('hero-src')
const out = document.getElementById('hero-out')
let frame = 0
src?.addEventListener('input', () => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => md.renderTo(out, src.value))
})
