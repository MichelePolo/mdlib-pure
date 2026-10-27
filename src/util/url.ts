// URL safety policy for links and images.
//
// Markdown is often untrusted input (comments, chat, CMS content), and a link
// like [click](javascript:alert(1)) is an XSS vector as soon as it is
// rendered. Every href/src passes through `allowUrl` (this function by
// default); when it returns false the attribute is emptied.
//
// URLs arrive here already percent-encoded by normalizeUrl, so obfuscations
// such as "java\tscript:" arrive as "java%09script:" (no longer a scheme),
// and entities like "&#106;avascript:" have already been decoded.

import type { UrlKind } from '../render/vnode.ts'

const reScheme = /^([a-z][a-z0-9+.-]*):/i

export function isSafeUrl(url: string, kind: UrlKind): boolean {
  const scheme = reScheme.exec(url)?.[1].toLowerCase()
  if (scheme === undefined) return true // relative URL, fragment or path

  // TODO(michele): define the default scheme policy. Questions to decide:
  //  - allowlist (only known-good schemes) or blocklist (javascript:, vbscript:…)?
  //  - `data:` for images only (data:image/png, gif, jpeg, webp — but not svg+xml,
  //    which can carry scripts)?
  //  - `tel:`, `sms:`, `ftp:`, app deep links (`vscode:`, `slack:`)?
  // Temporary conservative policy until then:
  void kind
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto'
}
