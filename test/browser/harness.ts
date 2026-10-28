// Browser test harness: bundles the sources (not dist/) into an IIFE exposing
// `window.mdlib`, and opens blank Chromium pages with it loaded.
import { readFileSync } from 'node:fs'
import { build } from 'esbuild'
import { type Browser, chromium, type Page } from 'playwright'

const root = new URL('../../', import.meta.url).pathname

let code: Promise<string> | undefined

function bundle(): Promise<string> {
  code ??= build({
    stdin: {
      contents: `
        export * from './src/index.ts'
        export { gfm } from './src/gfm/index.ts'
        export { container } from './src/plugins/container.ts'
      `,
      resolveDir: root,
      loader: 'ts',
    },
    bundle: true,
    format: 'iife',
    globalName: 'mdlib',
    target: 'es2022',
    write: false,
  }).then((r) => r.outputFiles[0].text)
  return code
}

export const readRepoFile = (path: string): string => readFileSync(root + path, 'utf8')

export const launch = (): Promise<Browser> => chromium.launch()

/** A blank page with `window.mdlib` and an empty `<div id="out" class="md">`. */
export async function openPage(browser: Browser, opts: { css?: string; scheme?: 'light' | 'dark' } = {}): Promise<Page> {
  const page = await browser.newPage({ colorScheme: opts.scheme ?? 'light' })
  await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="out" class="md"></div></body></html>')
  await page.addScriptTag({ content: await bundle() })
  if (opts.css) await page.addStyleTag({ content: opts.css })
  return page
}
