import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { RouterLink } from '@angular/router';
import { AccountInfo } from '../../application/account-settings-view';
import { AccountInfoRow } from './account-info-row';

@Component({
  selector: 'adm-account-security-panel',
  imports: [AccountInfoRow, TranslocoPipe, RouterLink, NwButton, NwIcon],
  template: `<dl>
      @for (row of rows(); track row.id) {
        <div adm-account-info-row [row]="row"></div>
      }
    </dl>
    @if (securityLink()) {
      <a
        class="account-panel__security-link"
        nw-button
        variant="secondary"
        routerLink="/settings/security"
        ><span>{{ 'settings.account.reviewSecurity' | transloco }}</span
        ><nw-icon name="arrow-right" size="sm"
      /></a>
    }`,
  styleUrl: './account-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSecurityPanel {
  readonly rows = input.required<readonly AccountInfo[]>();
  readonly securityLink = input(false);
}
