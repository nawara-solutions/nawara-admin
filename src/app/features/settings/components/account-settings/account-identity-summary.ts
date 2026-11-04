import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { AccountIdentitySummary as Identity } from '../../application/account-settings-view';

/** LOCAL account summary; no query, permission interpretation or shell avatar change. */
@Component({
  selector: 'adm-account-identity-summary',
  imports: [TranslocoPipe, NwIcon],
  template: `
    <div class="account-summary__person">
      <span class="account-summary__avatar" aria-hidden="true">
        @if (identity().initials; as initials) {
          {{ initials }}
        } @else {
          <nw-icon name="user-round" size="lg" />
        }
      </span>
      <div class="account-summary__identity">
        <p class="account-summary__name">
          <bdi>{{ identity().displayName ?? ('settings.account.profileTab' | transloco) }}</bdi>
        </p>
        @if (identity().email; as email) {
          <bdi class="account-summary__contact" dir="ltr" translate="no">{{ email }}</bdi>
        } @else if (identity().phone; as phone) {
          <bdi class="account-summary__contact" dir="ltr" translate="no">{{ phone }}</bdi>
        }
      </div>
    </div>
    <dl class="account-summary__role">
      <dt><nw-icon name="id-card" size="sm" />{{ 'settings.account.type' | transloco }}</dt>
      <dd>{{ identity().roleKey | transloco }}</dd>
    </dl>
  `,
  styleUrl: './account-identity-summary.scss',
  host: { class: 'account-summary', '[class.account-summary--stacked]': 'stacked()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountIdentitySummary {
  readonly identity = input.required<Identity>();
  readonly stacked = input(false);
}
