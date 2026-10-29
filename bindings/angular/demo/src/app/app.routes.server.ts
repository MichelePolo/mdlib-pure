import { RenderMode, type ServerRoute } from '@angular/ssr'

// Rendered on the server at each request (not prerendered at build time).
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }]
