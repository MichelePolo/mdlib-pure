// Core CommonMark inline rules. Each is a thin wrapper around an
// InlineParser method, so plugins can reorder, replace or precede them.

import type { InlineRule } from '../types.ts'

export const coreInlineRules: InlineRule[] = [
  { name: 'newline', triggers: '\n', parse: (p) => p.parseNewline() },
  { name: 'escape', triggers: '\\', parse: (p) => p.parseBackslash() },
  { name: 'codeSpan', triggers: '`', parse: (p) => p.parseBackticks() },
  { name: 'emphasis', triggers: '*_', parse: (p) => p.handleDelim(p.peek()) },
  { name: 'openBracket', triggers: '[', parse: (p) => p.parseOpenBracket() },
  { name: 'image', triggers: '!', parse: (p) => p.parseBang() },
  { name: 'closeBracket', triggers: ']', parse: (p) => p.parseCloseBracket() },
  { name: 'autolink', triggers: '<', parse: (p) => p.parseAutolink() },
  { name: 'htmlInline', triggers: '<', parse: (p) => p.parseHtmlTag() },
  { name: 'entity', triggers: '&', parse: (p) => p.parseEntity() },
]
