import { join } from 'node:path'
import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node'
import express from 'express'

const browserDistFolder = join(import.meta.dirname, '../browser')

const app = express()
const angularApp = new AngularNodeAppEngine()

// Static files from /browser (the KaTeX stylesheet and fonts included).
app.use(express.static(browserDistFolder, { maxAge: '1y', index: false, redirect: false }))

// Everything else: rendered by Angular on the server.
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next)
})

// Started directly (`node dist/demo/server/server.mjs`), on PORT or 4000.
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000
  app.listen(port, (error) => {
    if (error) throw error
    console.log(`Node Express server listening on http://localhost:${port}`)
  })
}

// Used by the Angular CLI (dev server, build).
export const reqHandler = createNodeRequestHandler(app)
