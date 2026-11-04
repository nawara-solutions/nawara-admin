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
      <div class="account-summary__portrait">
        <span class="account-summary__avatar" aria-hidden="true">
          @if (identity().initials; as initials) {
            {{ initials }}
          } @else {
            <nw-icon name="user-round" size="lg" />
          }
        </span>
        @if (stacked()) {
          <span class="account-summary__portrait-badge"><nw-icon name="id-card" size="sm" /></span>
        }
      </div>
      <div class="account-summary__identity">
        <p class="account-summary__name">
          <bdi>{{ identity().displayName ?? ('settings.account.profileTab' | transloco) }}</bdi>
        </p>
        @if (!stacked()) {
          <div class="account-summary__recognition">
            @if (identity().email; as email) {
              <bdi class="account-summary__contact" dir="ltr" translate="no">{{ email }}</bdi>
            } @else if (identity().phone; as phone) {
              <bdi class="account-summary__contact" dir="ltr" translate="no">{{ phone }}</bdi>
            }
            <dl class="account-summary__inline-role">
              <dt class="nw-visually-hidden">{{ 'settings.account.type' | transloco }}</dt>
              <dd><nw-icon name="id-card" size="sm" />{{ identity().roleKey | transloco }}</dd>
            </dl>
          </div>
        }
      </div>
    </div>
    @if (stacked()) {
      <dl class="account-summary__role">
        <dt class="nw-visually-hidden">
          <nw-icon name="id-card" size="sm" />{{ 'settings.account.type' | transloco }}
        </dt>
        <dd>{{ identity().roleKey | transloco }}</dd>
      </dl>
      <dl class="account-summary__contacts">
        <div>
          <dt><nw-icon name="mail" size="sm" />{{ 'settings.account.email' | transloco }}</dt>
          <dd>
            <bdi dir="ltr" translate="no">{{
              identity().email ?? ('settings.account.unavailable' | transloco)
            }}</bdi>
          </dd>
        </div>
        <div>
          <dt><nw-icon name="id-card" size="sm" />{{ 'settings.account.phone' | transloco }}</dt>
          <dd>
            <bdi dir="ltr" translate="no">{{
              identity().phone ?? ('settings.account.unavailable' | transloco)
            }}</bdi>
          </dd>
        </div>
      </dl>
      <div class="account-summary__note">
        <p><nw-icon name="info" size="sm" />{{ 'settings.account.readOnly' | transloco }}</p>
        <span>{{ 'settings.account.readOnlyNote' | transloco }}</span>
      </div>
    }
  `,
  styleUrl: './account-identity-summary.scss',
  host: { class: 'account-summary', '[class.account-summary--stacked]': 'stacked()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountIdentitySummary {
  readonly identity = input.required<Identity>();
  readonly stacked = input(false);
}
