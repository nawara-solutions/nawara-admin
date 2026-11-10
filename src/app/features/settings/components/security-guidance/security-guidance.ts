import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/** Explanatory content only; account policy and security actions remain in the page facade. */
@Component({
  selector: 'aside[adm-security-guidance]',
  imports: [TranslocoPipe, NwIcon],
  templateUrl: './security-guidance.html',
  styleUrl: './security-guidance.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SecurityGuidance {
  protected readonly rules = [
    {
      icon: 'log-in',
      title: 'settings.security.overview.signInTitle',
      body: 'settings.security.actions.signIn',
    },
    {
      icon: 'shield-alert',
      title: 'settings.security.overview.sensitiveTitle',
      body: 'settings.security.actions.stepUp',
    },
    {
      icon: 'lock-keyhole',
      title: 'settings.security.overview.lastFactorTitle',
      body: 'settings.security.actions.lastFactor',
    },
  ] as const;
}
