// Plugin template: copy this folder, rename, replace the example.
//
// Example feature: emoji shortcodes, `:tada:` → 🎉.
// It shows the most common plugin shape: one inline rule, one node type,
// one render function. See AGENTS.md ("Choosing the extension point") if your
// syntax is block-level or delimiter-based instead.
//
// When used inside this repo, import from '../../src/index.ts'.
// In your own project, import from 'mdlib-pure'.
import type { InlineRule, Plugin } from '../../src/index.ts'

export interface EmojiOptions {
  /** Shortcode → emoji. Merged over the defaults. */
  emoji?: Record<string, string>
}

const DEFAULTS: Record<string, string> = { tada: '🎉', rocket: '🚀', heart: '❤️', warning: '⚠️', check: '✅' }

// 1. AST node shape. Document it: it is the plugin's public contract.
//    { type: 'emoji', name: string, value: string }

export function emoji(options: EmojiOptions = {}): Plugin {
  // Rule 9 (AGENTS.md): a Map, so ":constructor:" cannot reach Object.prototype.
  const table = new Map(Object.entries({ ...DEFAULTS, ...options.emoji }))

  // 2. Inline rule: dispatched only when the parser meets a trigger char.
  const rule: InlineRule = {
    name: 'emoji',
    triggers: ':', // keep triggers few: every trigger char splits text runs
    parse(p) {
      // Sticky regex at p.pos. Bounded length ({1,32}) keeps it cheap even
      // on input like "::::::…" (rule 8: linear time).
      const m = p.match(/:([a-z0-9_+-]{1,32}):/y)
      if (!m) return false // not consumed: the parser emits ':' as text
      const name = m.slice(1, -1)
      const value = table.get(name)
      if (value === undefined) {
        p.pos -= m.length // unknown shortcode: give the input back
        return false
      }
      p.push({ type: 'emoji', name, value })
      return true
    },
  }

  return {
    name: 'emoji',
    inline: [rule],
    // 3. Render: text children are plain strings (escaped for you).
    render: {
      emoji: (n, r) => r.h('span', { class: 'md-emoji', role: 'img', 'aria-label': n.name as string }, n.value as string),
    },
  }
}
