import { type ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core'
import { provideClientHydration } from '@angular/platform-browser'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { provideMdlibPure } from 'ngx-mdlib-pure'
import { routes } from './app.routes'

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration(),
    // Defines <mdlib-markdown> and <mdlib-editor> in the browser. KaTeX and
    // Mermaid are fetched only by pages whose Markdown has math or a diagram
    // (the build splits them into lazy chunks).
    provideMdlibPure({
      loaders: {
        mermaid: () => import('mermaid'),
        katex: () => import('katex/contrib/auto-render').then((m) => m.default),
        // Copied from node_modules/katex/dist by angular.json "assets".
        katexStylesheet: '/katex/katex.min.css',
      },
      configs: {
        // Selected with config="demo". Functions can only be set here, never from templates.
        demo: {
          // External links open in a new tab.
          attributes: (node) => (node.type === 'link' && /^https?:/i.test(node['url'] as string) ? { target: '_blank', rel: 'noopener noreferrer' } : null),
        },
      },
    }),
  ],
}
