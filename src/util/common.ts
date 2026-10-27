// Shared character tables and string helpers.

export const C_TAB = 9
export const C_NEWLINE = 10
export const C_SPACE = 32
export const C_BANG = 33
export const C_AMPERSAND = 38
export const C_OPEN_PAREN = 40
export const C_CLOSE_PAREN = 41
export const C_ASTERISK = 42
export const C_COLON = 58
export const C_LESSTHAN = 60
export const C_GREATERTHAN = 62
export const C_OPEN_BRACKET = 91
export const C_BACKSLASH = 92
export const C_CLOSE_BRACKET = 93
export const C_UNDERSCORE = 95
export const C_BACKTICK = 96

export const ESCAPABLE = /[!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-]/.source
export const ENTITY = '&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});'

export const isSpaceOrTab = (c: number): boolean => c === C_SPACE || c === C_TAB

// CommonMark 0.31 counts both Unicode punctuation (P) and symbols (S).
// Using property escapes keeps Unicode tables out of the bundle.
const rePunctuation = /[\p{P}\p{S}]/u
const reWhitespace = /\s/

export const isPunctuation = (ch: string): boolean => rePunctuation.test(ch)
export const isUnicodeWhitespace = (ch: string): boolean => reWhitespace.test(ch)

const isMdSpace = (c: number): boolean => c === C_SPACE || c === C_TAB || c === C_NEWLINE || c === 13

/**
 * Trim spaces, tabs and line endings only (String#trim also strips NBSP).
 * A manual scan: `/[ \t]+$/` is quadratic on long inner runs of spaces.
 */
export function trimMd(s: string): string {
  let start = 0
  let end = s.length
  while (start < end && isMdSpace(s.charCodeAt(start))) start++
  while (end > start && isMdSpace(s.charCodeAt(end - 1))) end--
  return start === 0 && end === s.length ? s : s.slice(start, end)
}

const reHtmlSpecial = /[&<>"]/g
const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

export const escapeHtml = (s: string): string => s.replace(reHtmlSpecial, (c) => HTML_ESCAPES[c])
