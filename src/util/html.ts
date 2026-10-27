// Raw HTML patterns shared by HTML blocks and inline HTML (CommonMark 0.31).

const TAGNAME = '[A-Za-z][A-Za-z0-9-]*'
const ATTRIBUTENAME = '[a-zA-Z_:][a-zA-Z0-9:._-]*'
const UNQUOTEDVALUE = "[^\"'=<>`\\x00-\\x20]+"
const ATTRIBUTEVALUE = `(?:${UNQUOTEDVALUE}|'[^']*'|"[^"]*")`
const ATTRIBUTE = `(?:\\s+${ATTRIBUTENAME}(?:\\s*=\\s*${ATTRIBUTEVALUE})?)`

export const OPENTAG = `<${TAGNAME}${ATTRIBUTE}*\\s*/?>`
export const CLOSETAG = `</${TAGNAME}\\s*[>]`

const COMMENT = '<!-->|<!--->|<!--[\\s\\S]*?-->'
const PROCESSING = '[<][?][\\s\\S]*?[?][>]'
const DECLARATION = '<![A-Za-z]+[^>]*>'
const CDATA = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>'

/** Inline raw HTML, sticky: use with `lastIndex`. */
export const reHtmlTag = new RegExp(`(?:${OPENTAG}|${CLOSETAG}|${COMMENT}|${PROCESSING}|${DECLARATION}|${CDATA})`, 'y')
