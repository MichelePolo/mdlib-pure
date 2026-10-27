// Character reference decoding.
//
// Named entities need a 2,125-entry table (~11 KB gzipped). In the browser we
// let the DOM decode them instead; for Node/SSR, import the full table from
// `mdlib-pure/entities` and pass it as `decodeEntity`.

import { C_BACKSLASH, ENTITY, ESCAPABLE } from './common.ts'

/** Decodes an entity name (without `&` and `;`). Returns `undefined` if unknown. */
export type EntityDecoder = (name: string) => string | undefined

// A Map, not an object literal: "&constructor;" must not find Object.prototype.
const BASIC = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', '\u00a0'],
])

let textarea: HTMLTextAreaElement | undefined

/** Default decoder: DOM-based in browsers, a handful of common entities elsewhere. */
export const defaultEntityDecoder: EntityDecoder = (name) => {
  if (typeof document === 'undefined') return BASIC.get(name)
  if (!/^[a-z][a-z0-9]{1,31}$/i.test(name)) return undefined
  textarea ??= document.createElement('textarea')
  const src = `&${name};`
  // Safe: `name` is strictly alphanumeric (checked above), and a <textarea>
  // parses its content as RCDATA anyway: text only, never elements.
  textarea.innerHTML = src // check:allow-innerHTML
  const out = textarea.value
  // The HTML parser also expands legacy prefixes: "&notit;" → "¬it;".
  // Real entities decode to at most two code points, so reject anything longer.
  return out !== src && [...out].length <= 2 ? out : undefined
}

/** Decode a full reference like `&amp;`, `&#35;` or `&#x22;`. */
export function decodeReference(ref: string, named: EntityDecoder): string {
  if (ref.charCodeAt(1) === 35 /* # */) {
    const hex = ref[2] === 'x' || ref[2] === 'X'
    const cp = parseInt(ref.slice(hex ? 3 : 2, -1), hex ? 16 : 10)
    return cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? '�' : String.fromCodePoint(cp)
  }
  const out = named(ref.slice(1, -1)) // user-supplied decoders may return anything
  return typeof out === 'string' ? out : ref
}

const reEntityOrEscaped = new RegExp(`\\\\${ESCAPABLE}|${ENTITY}`, 'gi')

/** Resolve backslash escapes and character references in a string. */
export function unescapeString(s: string, named: EntityDecoder): string {
  if (s.indexOf('\\') < 0 && s.indexOf('&') < 0) return s
  return s.replace(reEntityOrEscaped, (m) => (m.charCodeAt(0) === C_BACKSLASH ? m[1] : decodeReference(m, named)))
}
