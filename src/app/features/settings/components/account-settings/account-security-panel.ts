import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { AccountSecurityInfo } from '../../application/account-settings-view';

const STATUS_KEYS: Readonly<Record<AccountSecurityInfo['status'], string>> = {
  reported: 'settings.account.securityStatus.reported',
  configured: 'settings.account.securityStatus.configured',
  'not-configured': 'settings.account.securityStatus.notConfigured',
  enabled: 'settings.account.securityStatus.enabled',
  disabled: 'settings.account.securityStatus.disabled',
  'not-reported': 'settings.account.notReported',
  unsupported: 'settings.account.securityStatus.unsupported',
  unavailable: 'settings.account.unavailable',
  unknown: 'settings.account.securityStatus.unknown',
};

/** Presentation only: no security query, enrollment inference or authorization policy. */
@Component({
  selector: 'adm-account-security-panel',
  imports: [TranslocoPipe, NwIcon],
  template: `
    <h3 id="account-security-heading" class="nw-visually-hidden">
      {{ 'settings.account.securityTab' | transloco }}
    </h3>
    <div class="account-security__cards">
      @for (row of rows(); track row.id) {
        <article class="account-security__card" [attr.aria-labelledby]="'security-card-' + row.id">
          <span class="account-security__icon"><nw-icon [name]="row.icon" /></span>
          <div class="account-security__body">
            <h4 [id]="'security-card-' + row.id">{{ row.label | transloco }}</h4>
            @if (row.description; as description) {
              <p>{{ description | transloco }}</p>
            }
            <dl>
              <dt class="nw-visually-hidden">{{ row.label | transloco }}</dt>
              <dd [attr.data-fact]="row.id" [attr.data-security-status]="row.status">
                <span class="account-security__status"
                  ><nw-icon name="circle-help" size="sm" />{{
                    statusKey(row.status) | transloco
                  }}</span
                >
                @if (row.value; as value) {
                  <bdi [attr.dir]="row.machine ? 'ltr' : null">{{
                    row.translated ? (value | transloco) : value
                  }}</bdi>
                }
              </dd>
            </dl>
          </div>
        </article>
      }
    </div>
    @if (informationNote(); as note) {
      <p class="account-security__explanation">
        <nw-icon name="info" size="sm" /><span>{{ note | transloco }}</span>
      </p>
    }
  `,
  styleUrl: './account-security-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountSecurityPanel {
  readonly rows = input.required<readonly AccountSecurityInfo[]>();
  readonly securityLink = input(false);
  protected statusKey(status: AccountSecurityInfo['status']): string {
    return STATUS_KEYS[status];
  }
  protected informationNote(): string | null {
    const rows = this.rows();
    const unreported = rows.filter((row) => row.status === 'not-reported').length;
    if (unreported === 0) return null;
    return unreported === rows.length
      ? 'settings.account.securitySessionNote'
      : 'settings.account.securityPartialNote';
  }
}
