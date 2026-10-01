import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwToastOutlet } from './shared/ui/toast/toast-outlet';

/** Root component. The application shell (sidebar, top bar, landmarks) arrives in A3 (docs/ROADMAP.md). */
@Component({
  selector: 'adm-root',
  imports: [RouterOutlet, TranslocoPipe, NwToastOutlet],
  template: `
    <router-outlet />
    <nw-toast-outlet [dismissLabel]="'common.dismiss' | transloco" />
  `,
})
export class App {}
