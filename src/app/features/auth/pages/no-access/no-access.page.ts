import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SIGN_IN_PATH } from '../../../../core/auth/return-url';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { AuthFlowFacade } from '../../application/auth-flow.facade';
import { AuthCard } from '../../components/auth-card/auth-card';
import { IdentityRow } from '../../components/identity-row/identity-row';

/**
 * Authenticated, but without usable administrative access (for example no admin tier, or an operator without assignments). Shown only right after
 * the access check; otherwise it returns to sign-in. Which Core answers lead here is still to verify (🟡).
 */
@Component({
  selector: 'adm-no-access-page',
  imports: [TranslocoPipe, NwButton, NwIcon, AuthCard, IdentityRow],
  template: `
    @if (flow.noAccessContact(); as email) {
      <adm-auth-card
        icon="shield-off"
        tone="danger"
        [title]="'auth.noAccess.title' | transloco"
        [subtitle]="'auth.noAccess.subtitle' | transloco"
      >
        <adm-identity-row [label]="'auth.noAccess.signedInAs' | transloco" [email]="email" />
        <p class="no-access__help">{{ 'auth.noAccess.help' | transloco }}</p>
        <button
          nw-button
          variant="secondary"
          type="button"
          class="no-access__sign-out"
          (click)="flow.signOut()"
        >
          <nw-icon name="log-out" size="sm" />
          <span>{{ 'auth.signOut' | transloco }}</span>
        </button>
      </adm-auth-card>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .no-access__help {
      color: var(--nw-text-secondary);
      font-size: 0.8125rem;
      line-height: 1.55;
    }

    .no-access__sign-out {
      min-block-size: 2.5rem;
      color: var(--nw-text-label);
      font-size: 0.8125rem;
      font-weight: var(--nw-font-weight-medium);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'no-access' },
})
export class NoAccessPage {
  protected readonly flow = inject(AuthFlowFacade);

  constructor() {
    if (this.flow.noAccessContact() === null) {
      void inject(Router).navigate([SIGN_IN_PATH], { replaceUrl: true });
    }
  }
}
