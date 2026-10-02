import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { APP_ENVIRONMENT, DemoSignInHint } from '../../../../core/config/app-environment';
import { PreferenceMenus } from '../../../../layout/preference-menus/preference-menus';
import { NwBrandMark } from '../../../../shared/ui/brand-mark/brand-mark';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { AuthFlowFacade } from '../../application/auth-flow.facade';
import { AuthCard } from '../auth-card/auth-card';

/**
 * The frame of every sign-in page (A4 design), outside the authenticated shell: no navigation, no scope, no profile.
 * Desktop puts the brand panel on the inline-start side; tablet and phone stack a compact header above the card.
 * Language and theme stay available before sign-in. It owns the sign-in flow (`AuthFlowFacade`), so the flow's state
 * lives exactly as long as the user is on these pages, and it shows the in-flow "Checking your access" step.
 *
 * In a demo build only, a note under the card lists the fictional demo accounts (never in a production build).
 */
@Component({
  selector: 'adm-auth-frame',
  imports: [RouterOutlet, TranslocoPipe, NwBrandMark, NwSpinner, PreferenceMenus, AuthCard],
  templateUrl: './auth-frame.html',
  styleUrl: './auth-frame.scss',
  providers: [AuthFlowFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'auth-frame' },
})
export class AuthFrame {
  protected readonly flow = inject(AuthFlowFacade);
  protected readonly demo = signal<DemoSignInHint | null>(null);

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then((bindings) => this.demo.set(bindings.signIn));
  }
}
