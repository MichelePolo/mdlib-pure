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

/**
 * Time limit for linear-time tests. CI machines are several times slower
 * than a laptop; a quadratic regression is off by orders of magnitude, so a
 * 3x allowance on CI keeps the tests meaningful without flaking.
 */
export const budget = (ms: number): number => (process.env.CI ? ms * 3 : ms)
