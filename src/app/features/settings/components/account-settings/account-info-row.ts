import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import type { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { AccountInfo } from '../../application/account-settings-view';

/** A real dl child, preserving the native label/value relationship. */
@Component({
  selector: 'div[adm-account-info-row]',
  imports: [TranslocoPipe, NwIcon],
  template: `
    <dt>
      @if (icon(); as name) {
        <nw-icon [name]="name" size="sm" />
      }
      {{ row().label | transloco }}
    </dt>
    <dd [attr.data-fact]="row().id">
      @if (row().value; as value) {
        @if (row().translated) {
          {{ value | transloco }}
        } @else {
          <bdi [attr.dir]="row().machine ? 'ltr' : null" translate="no">{{ value }}</bdi>
        }
      } @else {
        <span class="account-info-row__missing">{{
          'settings.account.unavailable' | transloco
        }}</span>
      }
      @if (row().description; as description) {
        <p>{{ description | transloco }}</p>
      }
    </dd>
  `,
  host: {
    '[class.account-info-row--stacked]': 'stacked()',
    '[class.account-info-row--badge]': 'badge()',
  },
  styleUrl: './account-info-row.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountInfoRow {
  readonly row = input.required<AccountInfo>();
  readonly stacked = input(false);
  readonly badge = input(false);
  readonly icon = input<NwIconName | null>(null);
}
