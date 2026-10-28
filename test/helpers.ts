// Shared test helpers (not a test file: no side effects on import).

/**
 * Normalize HTML serialization style: sorted attributes, no self-closing
 * slash, `attr=""` → `attr`, no whitespace between tags.
 */
export function normalize(html: string): string {
  return html
    .replace(/<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:="[^"]*")?)*)\s*\/?>/g, (_, tag: string, attrs: string) => {
      const list = (attrs.match(/[^\s=]+(?:="[^"]*")?/g) ?? []).map((a) => a.replace(/=""$/, '')).sort()
      return `<${tag.toLowerCase()}${list.map((a) => ' ' + a).join('')}>`
    })
    .replace(/>\s+</g, '><')
    .trim()
}
