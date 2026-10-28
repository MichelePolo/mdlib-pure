// A tiny syntax highlighter for the site, plugged into mdlib-pure through the
// `highlight(code, lang)` option. It returns VNodes (spans), so rendering stays
// on the DOM-safe path of renderTo() and needs no escaping by hand.
//
// Each language is a list of [class, sticky regex] tried in order at the
// current position; the first match wins. Every regex is linear on any input
// (AGENTS.md rule 8): alternatives inside quantifiers never overlap, and
// unclosed comments or strings consume to the end instead of backtracking.
import { h } from '../../src/render/vnode.ts'

const word = (list) => new RegExp(`\\b(?:${list})\\b`, 'y')

const JS = [
  ['comment', /\/\/[^\n]*|\/\*(?:[^*]|\*(?!\/))*(?:\*\/)?/y],
  ['string', /'(?:[^'\\\n]|\\.)*'?|"(?:[^"\\\n]|\\.)*"?|`(?:[^`\\]|\\[\s\S])*`?/y],
  ['keyword', word('as|async|await|break|case|catch|class|const|continue|default|delete|do|else|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|return|static|switch|this|throw|try|type|typeof|var|void|while|yield')],
  ['atom', /\b(?:true|false|null|undefined|NaN|Infinity)\b|\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?n?\b/y],
  ['fn', /[A-Za-z_$][\w$]*(?=\()/y],
]
const JSX = [...JS, ['tag', /<\/?[A-Za-z][\w.]*|\/?>/y]]

const CSS = [
  ['comment', /\/\*(?:[^*]|\*(?!\/))*(?:\*\/)?/y],
  ['string', /'(?:[^'\\\n]|\\.)*'?|"(?:[^"\\\n]|\\.)*"?/y],
  ['keyword', /@[\w-]+/y],
  ['prop', /--?[A-Za-z][\w-]*(?=\s*:)/y],
  ['atom', /#[\da-fA-F]{3,8}\b|-?\b\d+(?:\.\d+)?(?:%|[a-z]+)?/y],
  ['fn', /[A-Za-z][\w-]*(?=\()/y],
]

const SH = [
  ['comment', /#[^\n]*/y],
  ['string', /'[^']*'?|"(?:[^"\\\n]|\\.)*"?/y],
  ['keyword', word('npm|npx|node|git|cd')],
  ['atom', /(?<![\w-])--?[A-Za-z][\w-]*/y],
]

const HTML = [
  ['comment', /<!--(?:[^-]|-(?!->))*(?:-->)?/y],
  ['tag', /<\/?[A-Za-z][\w-]*|\/?>/y],
  ['string', /"[^"]*"?|'[^']*'?/y],
  ['prop', /[A-Za-z_:][\w:.-]*(?==)/y],
]

const JSON_ = [
  ['prop', /"(?:[^"\\\n]|\\.)*"(?=\s*:)/y],
  ['string', /"(?:[^"\\\n]|\\.)*"?/y],
  ['atom', /\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/y],
]

const LANGS = new Map([
  ['js', JS], ['javascript', JS], ['mjs', JS], ['ts', JS], ['typescript', JS], ['jsx', JSX], ['tsx', JSX],
  ['css', CSS], ['sh', SH], ['bash', SH], ['shell', SH], ['html', HTML], ['xml', HTML], ['json', JSON_],
])

// Plain text that no rule matched: whole words and runs, to keep tokens few.
const rePlain = /[A-Za-z_$][\w$]*|\s+|[^\sA-Za-z_$]/y

/** Tokens as `[class | null, text]` pairs; `null` is plain text. */
export function tokenize(code, rules) {
  const out = []
  let plain = ''
  let pos = 0
  outer: while (pos < code.length) {
    for (const [cls, re] of rules) {
      re.lastIndex = pos
      const m = re.exec(code)
      if (m && m[0]) {
        if (plain) out.push([null, plain]), (plain = '')
        out.push([cls, m[0]])
        pos = re.lastIndex
        continue outer
      }
    }
    rePlain.lastIndex = pos
    const m = rePlain.exec(code)
    plain += m[0]
    pos = rePlain.lastIndex
  }
  if (plain) out.push([null, plain])
  return out
}

/** The `highlight` option: VNodes for known languages, `null` otherwise. */
export function highlight(code, lang) {
  const rules = lang ? LANGS.get(lang.toLowerCase()) : undefined
  if (!rules) return null
  return tokenize(code, rules).map(([cls, text]) => (cls ? h('span', { class: `tok-${cls}` }, text) : text))
}
