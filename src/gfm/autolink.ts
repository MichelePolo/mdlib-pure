// GFM extended autolinks: www.example.com, https://example.com, a@b.co,
// mailto:a@b.co, xmpp:a@b.co/resource. Rules follow cmark-gfm:
// - www. and http(s)/ftp URLs are an inline rule, so a URL is consumed before
//   emphasis sees its `__` or `**` (https://x.com/__init__.py stays one link).
//   It fires on the rare `:` and `.`, then takes back the scheme or `www`
//   already emitted as text (p.trimText), so ordinary words cost nothing;
// - emails are a transform over text nodes (links, code and HTML untouched).
// Every scan only moves forward or back over a bounded run: linear time.

import type { InlineRule, Node, Plugin } from '../types.ts'
import { normalizeUrl } from '../util/normalize.ts'

const isAlnum = (c: number): boolean => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
const isAlpha = (c: number): boolean => (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
const isSpace = (c: number): boolean => c === 32 || (c >= 9 && c <= 13)
const rePunct = /\p{P}/u

/** Host characters: ASCII alphanumerics, or non-ASCII that is neither space nor punctuation. */
function isHostChar(s: string, i: number): boolean {
  const c = s.charCodeAt(i)
  if (c < 128) return isAlnum(c)
  return !/\s/.test(s[i]) && !rePunct.test(s[i])
}

/** End of a valid domain starting at `i`, or 0. No `_` allowed in the last two labels. */
function domainEnd(s: string, i: number, allowShort: boolean): number {
  let dots = 0
  let us1 = 0
  let us2 = 0
  const start = i
  for (; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c === 95 /* _ */) us2++
    else if (c === 46 /* . */) {
      us1 = us2
      us2 = 0
      dots++
    } else if (c !== 45 /* - */ && !isHostChar(s, i)) break
  }
  if (i === start || ((us1 > 0 || us2 > 0) && dots <= 10)) return 0
  return allowShort || dots > 0 ? i : 0
}

/** Trim trailing punctuation, unbalanced `)` and entity-like `&name;` from [start, end). */
function trimEnd(s: string, start: number, end: number): number {
  let open = 0
  let close = 0
  for (let i = start; i < end; i++) {
    const c = s.charCodeAt(i)
    if (c === 40) open++
    else if (c === 41) close++
  }
  while (end > start) {
    const c = s[end - 1]
    if (c === ')') {
      if (close <= open) return end
      close--
      end--
    } else if ('?!.,:*_~\'"'.includes(c)) {
      end--
    } else if (c === ';') {
      let i = end - 2
      while (i > start && isAlpha(s.charCodeAt(i))) i--
      end = i < end - 2 && s[i] === '&' ? i : end - 1
    } else {
      return end
    }
  }
  return end
}

/** Scan a URL path: everything up to whitespace or `<`. */
function pathEnd(s: string, i: number): number {
  while (i < s.length && !isSpace(s.charCodeAt(i)) && s[i] !== '<') i++
  return i
}

interface Match {
  start: number
  end: number
  url: string
}

function matchWww(s: string, i: number): Match | null {
  if (i > 0 && !isSpace(s.charCodeAt(i - 1)) && !'*_~('.includes(s[i - 1])) return null
  const d = domainEnd(s, i, false)
  if (!d) return null
  const end = trimEnd(s, i, pathEnd(s, d))
  return end > i ? { start: i, end, url: 'http://' + s.slice(i, end) } : null
}

/** At `:` of "://": rewind over the scheme letters. */
function matchUrl(s: string, colon: number, floor: number): Match | null {
  let start = colon
  while (start > floor && isAlpha(s.charCodeAt(start - 1))) start--
  const scheme = s.slice(start, colon).toLowerCase()
  if (scheme !== 'http' && scheme !== 'https' && scheme !== 'ftp') return null
  const d = domainEnd(s, colon + 3, true)
  if (!d) return null
  const end = trimEnd(s, start, pathEnd(s, d))
  return { start, end, url: s.slice(start, end) }
}

const isLocalChar = (c: number): boolean => isAlnum(c) || c === 46 || c === 43 || c === 45 || c === 95

/** At `@`: rewind over the local part, detect mailto:/xmpp:, scan the domain forward. */
function matchEmail(s: string, at: number, floor: number): Match | null {
  let start = at
  while (start > floor && isLocalChar(s.charCodeAt(start - 1))) start--
  if (start === at) return null

  // Explicit scheme, not glued to a preceding alphanumeric ("mmmmailto:" is not one).
  let scheme = ''
  for (const candidate of ['mailto:', 'xmpp:']) {
    const p = start - candidate.length
    if (p >= floor && s.startsWith(candidate, p) && (p === 0 || !isAlnum(s.charCodeAt(p - 1)))) scheme = candidate
  }

  let end = at + 1
  let dots = 0
  for (; end < s.length; end++) {
    const c = s.charCodeAt(end)
    if (isAlnum(c)) continue
    // A second @: not this email. The main loop retries from that @, whose
    // local part cannot extend past this one, so the total work stays linear.
    if (c === 64) return null
    if (c === 46 && end + 1 < s.length && isAlnum(s.charCodeAt(end + 1))) dots++
    else if (c === 47 && scheme === 'xmpp:') continue // xmpp resource: user@host/resource
    else if (c !== 45 && c !== 95) break
  }
  const last = s.charCodeAt(end - 1)
  if (end - at < 2 || dots === 0 || (!isAlpha(last) && last !== 46)) return null
  end = trimEnd(s, start, end)
  if (scheme) return { start: start - scheme.length, end, url: s.slice(start - scheme.length, end) }
  return { start, end, url: 'mailto:' + s.slice(start, end) }
}

/** Split one text value into text and link nodes, or return null if nothing links. */
function linkify(s: string): Node[] | null {
  if (s.indexOf('@') < 0) return null // native scan: most text has no email
  let out: Node[] | null = null
  let last = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    const m = c === 64 ? matchEmail(s, i, last) : null
    if (!m) continue
    out ??= []
    if (m.start > last) out.push({ type: 'text', value: s.slice(last, m.start) })
    out.push({ type: 'link', url: normalizeUrl(m.url), title: null, children: [{ type: 'text', value: s.slice(m.start, m.end) }] })
    last = m.end
    i = m.end - 1
  }
  if (out && last < s.length) out.push({ type: 'text', value: s.slice(last) })
  return out
}

const SKIP = new Set(['link', 'inlineCode', 'html', 'code', 'image'])

const urlRule: InlineRule = {
  name: 'gfmAutolink',
  triggers: ':.',
  parse(p) {
    // Like cmark-gfm: no autolinks inside link or image text (`[http://a](b)`).
    if (p.inBracket()) return false
    const s = p.src
    const i = p.pos
    let m: Match | null = null
    if (s.charCodeAt(i) === 58 /* : */) {
      if (s.startsWith('//', i + 1)) m = matchUrl(s, i, 0) // rewinds over the scheme letters
    } else if (i >= 3 && s.startsWith('www', i - 3)) {
      m = matchWww(s, i - 3)
    }
    // The scheme or `www` was already emitted as text: take it back.
    if (!m || m.start >= i || !p.trimText(s.slice(m.start, i))) return false
    p.push({ type: 'link', url: normalizeUrl(m.url), title: null, children: [{ type: 'text', value: s.slice(m.start, m.end) }] })
    p.pos = m.end
    return true
  },
}

function walk(node: Node): void {
  const children = node.children
  if (!children) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.type === 'text') {
      const parts = linkify(child.value as string)
      if (parts) {
        children.splice(i, 1, ...parts)
        i += parts.length - 1
      }
    } else if (!SKIP.has(child.type)) {
      walk(child)
    }
  }
}

export const autolink = (): Plugin => ({
  name: 'gfm-autolink',
  inline: [urlRule],
  transform: (root) => walk(root),
})
