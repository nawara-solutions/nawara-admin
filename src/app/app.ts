import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * A1 placeholder root. The application shell, design system and localization arrive in A2/A3
 * (docs/ROADMAP.md); this component only proves the workspace builds, routes and tests.
 */
@Component({
  selector: 'adm-root',
  imports: [RouterOutlet],
  template: `
    <main>
      <h1>Nawara Admin</h1>
      <router-outlet />
    </main>
  `,
})
export class App {}
