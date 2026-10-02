import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwBrandMark } from '../../shared/ui/brand-mark/brand-mark';
import { PreferenceMenus } from '../preference-menus/preference-menus';

/** Frame for pages shown without a session (no navigation, no scope): the logo, preferences and a `main` landmark. */
@Component({
  selector: 'adm-minimal-shell',
  imports: [RouterOutlet, TranslocoPipe, NwBrandMark, PreferenceMenus],
  template: `
    <header class="minimal-shell__header">
      <nw-brand-mark [label]="'brand.logoLabel' | transloco" lockup />
      <adm-preference-menus />
    </header>
    <main class="minimal-shell__main"><router-outlet /></main>
  `,
  styles: `
    :host {
      display: block;
      min-block-size: 100dvh;
      padding: var(--nw-space-5) clamp(var(--nw-space-4), 3vw, var(--nw-space-8));
      background-color: var(--nw-surface-sidebar);
    }

    .minimal-shell__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--nw-space-4);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'minimal-shell' },
})
export class MinimalShell {}
