// Helpers shared by the specs (not part of the package: tsconfig.lib.json excludes src/testing/).
import type { MdlibEditorElement } from '../lib/markdown-editor'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Wait until `ok()` is truthy (polling, 2 s at most). */
export async function until(ok: () => unknown, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms
  while (!ok()) {
    if (Date.now() > deadline) throw new Error('timed out')
    await sleep(10)
  }
}

export const textarea = (el: Element) => el.querySelector('textarea') as HTMLTextAreaElement

/** Type like a user: the text area gets the text and its own `input` event. */
export function type(el: MdlibEditorElement, text: string): void {
  const ta = textarea(el)
  ta.focus()
  ta.value = text
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

/** Leave the text area: the element sends a pending `input`, then `change`. */
export function blur(el: MdlibEditorElement): void {
  const ta = textarea(el)
  if (document.activeElement === ta) ta.blur()
  else ta.dispatchEvent(new FocusEvent('blur'))
}

/** The preview one animation frame after the last keystroke (the element renders on the next frame). */
export const nextFrame = () => new Promise((r) => requestAnimationFrame(r))
