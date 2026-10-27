// Link label and URL normalization.

/**
 * Normalize a link label for matching: collapse whitespace and apply Unicode
 * case folding. `toLowerCase().toUpperCase()` approximates full case folding
 * (e.g. "ẞ" → "ß" → "SS" matches "ss").
 */
export const normalizeLabel = (label: string): string =>
  label.trim().replace(/[ \t\r\n]+/g, ' ').toLowerCase().toUpperCase()

// Characters left as-is when percent-encoding URLs (besides [A-Za-z0-9]).
const KEEP = ";/?:@&=+$,-_.!~*'()#"
const ENCODE: string[] = []
for (let i = 0; i < 128; i++) {
  const ch = String.fromCharCode(i)
  ENCODE[i] = /[0-9a-z]/i.test(ch) || KEEP.includes(ch) ? ch : '%' + i.toString(16).toUpperCase().padStart(2, '0')
}

/**
 * Percent-encode a URL the way CommonMark reference implementations do:
 * existing `%XX` escapes are preserved, unsafe ASCII is encoded, non-ASCII is
 * UTF-8 encoded, and lone surrogates become U+FFFD.
 */
export function normalizeUrl(url: string): string {
  let out = ''
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i)
    if (c === 0x25 /* % */ && /^[0-9a-f]{2}$/i.test(url.slice(i + 1, i + 3))) {
      out += url.slice(i, i + 3)
      i += 2
    } else if (c < 128) {
      out += ENCODE[c]
    } else if (c >= 0xd800 && c <= 0xdfff) {
      const next = url.charCodeAt(i + 1)
      if (c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
        out += encodeURIComponent(url[i] + url[i + 1])
        i++
      } else {
        out += '%EF%BF%BD'
      }
    } else {
      out += encodeURIComponent(url[i])
    }
  }
  return out
}
