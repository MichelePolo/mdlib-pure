import { Component } from '@angular/core'
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router'

@Component({
  selector: 'demo-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="site">
      <a class="brand" routerLink="/">mdlib-pure <span>for Angular</span></a>
      <nav aria-label="Pages">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" id="nav-editor">Editor</a>
        <a routerLink="/forms" routerLinkActive="active" id="nav-forms">Forms</a>
      </nav>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
})
export class App {}
