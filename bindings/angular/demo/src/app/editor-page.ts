import { afterNextRender, Component, computed, inject, input, numberAttribute, signal } from '@angular/core'
import type { Node } from 'mdlib-pure'
import { MarkdownEditor, MarkdownService, MarkdownViewer, type TocEntry } from 'ngx-mdlib-pure'
import { WELCOME } from './samples'

interface AstSummary {
  nodes: number
  types: string
  htmlLength: number
  toc: TocEntry[]
}

/** Every node of a tree, depth first (iterative: deep documents are fine). */
function descendants(root: Node): Node[] {
  const out: Node[] = []
  const stack: Node[] = [root]
  while (stack.length) {
    const n = stack.pop()!
    out.push(n)
    const children = (n as { children?: Node[] }).children
    if (children) for (let i = children.length - 1; i >= 0; i--) stack.push(children[i])
  }
  return out
}

/**
 * The editor bound to a signal with [(value)], that value as Angular sees it,
 * a viewer of the same text, and MarkdownService (outline rendered on the
 * server too, AST on demand).
 */
@Component({
  selector: 'demo-editor-page',
  imports: [MarkdownEditor, MarkdownViewer],
  template: `
    <h1>Editor with live preview</h1>
    <p class="lead">
      <code>&lt;mdlib-editor [(value)]&gt;</code> and <code>&lt;mdlib-markdown [source]&gt;</code>: rendered on the server, hydrated in the browser. The preview follows every keystroke; the signal follows after a
      typing pause ({{ delay() ?? 200 }} ms) and at once on blur.
    </p>
    <p id="status" class="status" [attr.data-interactive]="interactive()">
      @if (interactive()) {
        Interactive (hydrated in the browser)
      } @else {
        Server-rendered, waiting for the browser…
      }
    </p>

    <mdlib-editor id="editor" [(value)]="body" plugins="all" config="demo" [delay]="delay()" label="Release notes (Markdown)" (valueCommit)="commits.set(commits() + 1)" style="block-size: 30rem" />

    <div class="panels">
      <section>
        <h2>
          Angular value <small id="value-length">{{ body().length }} characters, {{ commits() }} commits (blur)</small>
        </h2>
        <pre id="value">{{ body() }}</pre>
      </section>
      <section>
        <h2>Viewer</h2>
        <mdlib-markdown id="viewer" class="viewer" [source]="body()" plugins="all" config="demo" />
      </section>
    </div>

    <section class="ast">
      <h2>MarkdownService</h2>
      <p>Outline, computed from the signal (on the server too):</p>
      <ol id="outline">
        @for (h of outline(); track h.id) {
          <li [style.margin-inline-start.em]="h.depth - 1">{{ h.text }}</li>
        }
      </ol>
      <p>
        <button type="button" id="ast" (click)="showAst()">AST and table of contents</button>
        <code>parse()</code>, <code>toc()</code> and <code>render()</code>.
      </p>
      @if (ast(); as a) {
        <p id="ast-count"><strong>{{ a.nodes }}</strong> nodes: {{ a.types }}</p>
        <p id="ast-html">HTML: {{ a.htmlLength }} characters</p>
        <ol id="toc">
          @for (entry of a.toc; track entry.id) {
            <li [attr.data-depth]="entry.depth">
              <a [href]="'#' + entry.id">{{ entry.text }}</a> <code>#{{ entry.id }}</code>
            </li>
          }
        </ol>
      }
    </section>
  `,
})
export class EditorPage {
  readonly #markdown = inject(MarkdownService)

  /** `?delay=800`: debounce of the editor (route query parameter, withComponentInputBinding). */
  readonly delay = input<number | undefined, unknown>(undefined, { transform: (v: unknown) => (v == null || v === '' ? undefined : numberAttribute(v)) })

  readonly body = signal(WELCOME)
  readonly commits = signal(0)
  readonly interactive = signal(false)
  readonly outline = computed(() => this.#markdown.toc(this.body(), 'all', 'demo'))
  readonly ast = signal<AstSummary | null>(null)

  constructor() {
    afterNextRender(() => this.interactive.set(true))
  }

  showAst(): void {
    const text = this.body()
    const nodes = descendants(this.#markdown.parse(text, 'all', 'demo'))
    const counts = new Map<string, number>()
    for (const n of nodes) counts.set(n.type, (counts.get(n.type) ?? 0) + 1)
    const types = [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t, c]) => `${t} × ${c}`)
      .join(', ')
    this.ast.set({ nodes: nodes.length, types, htmlLength: this.#markdown.render(text, 'all', 'demo').length, toc: this.#markdown.toc(text, 'all', 'demo') })
  }
}
