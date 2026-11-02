import type { Routes } from '@angular/router'
import { EditorPage } from './editor-page'

export const routes: Routes = [
  { path: '', component: EditorPage, title: 'ngx-mdlib-pure: editor' },
  // Lazy: on a client-side navigation Angular creates the elements itself (no hydration).
  { path: 'forms', loadComponent: () => import('./forms-page').then((m) => m.FormsPage), title: 'ngx-mdlib-pure: forms' },
  { path: 'podcast', loadComponent: () => import('./podcast-page').then((m) => m.PodcastPage), title: 'ngx-mdlib-pure: podcast editor' },
]
