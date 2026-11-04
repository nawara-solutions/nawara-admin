import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { AccountSecurityInfo } from '../../application/account-settings-view';

@Component({
  selector: 'adm-account-security-panel',
  imports: [TranslocoPipe, RouterLink, NwButton, NwIcon],
  template: `
    <section class="account-security__summary" aria-labelledby="account-security-summary">
      <h4 id="account-security-summary">{{ 'settings.account.securitySummary' | transloco }}</h4>
      <ul role="list">
        @for (row of rows(); track row.id) {
          <li>
            <nw-icon [name]="row.icon" />
            <div>
              <p>{{ row.label | transloco }}</p>
              <span>{{ 'settings.account.notReported' | transloco }}</span>
            </div>
          </li>
        }
      </ul>
    </section>
    <p class="account-security__explanation">
      {{ 'settings.account.securitySessionNote' | transloco }}
    </p>
    <dl class="account-security__details">
      @for (row of rows(); track row.id) {
        <div class="account-security__row">
          <dt>
            <span class="account-security__icon"><nw-icon [name]="row.icon" /></span
            >{{ row.label | transloco }}
          </dt>
          <dd [attr.data-fact]="row.id" [attr.data-security-status]="row.status">
            <span class="account-security__status">{{
              'settings.account.notReported' | transloco
            }}</span>
            @if (row.description; as description) {
              <p>{{ description | transloco }}</p>
            }
          </dd>
        </div>
      }
    </dl>
    @if (securityLink()) {
      <a class="account-security__link" nw-button variant="outline" routerLink="/settings/security">
        <nw-icon name="shield-check" size="sm" /><span>{{
          'settings.account.reviewSecurity' | transloco
        }}</span
        ><nw-icon name="arrow-right" size="sm" />
      </a>
    }
  `,
  styleUrl: './account-security-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSecurityPanel {
  readonly rows = input.required<readonly AccountSecurityInfo[]>();
  readonly securityLink = input(false);
}
