/** The complete editable episode, including its separate supporting documents. */
export interface PodcastEpisode {
  /** Main rundown in Markdown. Its time tags determine the planned duration. */
  source: string
  /** Supporting Markdown documents keyed by name. "Scaletta" is reserved. */
  documents: Record<string, string>
  /** Open document; "Scaletta" selects the main rundown. */
  activeDocument: string
  /** Sum of the recognized time tags in `source`, computed by the browser. Supporting documents are excluded. */
  durationCentiseconds: number
}

/**
 * Options of the podcast grammar, read when the element connects. The
 * defaults are the sample's grammar.
 */
export interface PodcastGrammar {
  /** `centiseconds` (`M:SS` or `M:SS:CC`, default) or `clock` (`m:ss`, `h:mm:ss`, `5m`, `90s`, `2m30s`). */
  durations?: 'centiseconds' | 'clock'
  tags?: {
    /** `participants` (default): only the configured names become badges; `any`: every `@name`. */
    mentions?: 'participants' | 'any'
    /** Recognize `#topic` tags, coloured like `@names`. */
    hashtags?: boolean
  }
  /** One source line = one block: soft line breaks split paragraphs; setext headings and indented code are off. */
  lineBlocks?: boolean
  /** Also accept `[]`, `[ x ]`, a box without a following space and glued list markers (`-[]`). */
  looseTasks?: boolean
}

/** A checkbox click while `tasks` is `notify` (lines and boxes 0-based). */
export interface PodcastTaskEvent {
  document: string
  id: number
  checked: boolean
  line: number
  box: number
}

/** A document button click while `documents` is `host`. */
export interface PodcastDocumentEvent {
  name: string
  title: string
}

/** The timer chip shown as running: source line and ordinal of the timer on it (0-based); `text` replaces the planned value. */
export interface PodcastTimer {
  line: number
  index: number
  text?: string
}
