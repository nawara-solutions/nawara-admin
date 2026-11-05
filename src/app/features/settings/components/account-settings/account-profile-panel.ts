import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import type { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { AccountInfo } from '../../application/account-settings-view';
import { AccountInfoRow } from './account-info-row';

@Component({
  selector: 'adm-account-profile-panel',
  imports: [AccountInfoRow, TranslocoPipe, NwIcon],
  template: `<div class="account-profile__tiles">
    @for (row of details(); track row.id) {
      <dl>
        <div
          adm-account-info-row
          [row]="row"
          [tile]="true"
          [icon]="icons[row.id] ?? 'id-card'"
        ></div>
      </dl>
    }
    <aside
      class="account-profile__note"
      [attr.aria-label]="'settings.account.readOnly' | transloco"
    >
      <nw-icon name="lock-keyhole" />
      <div>
        <p>{{ 'settings.account.readOnly' | transloco }}</p>
      </div>
    </aside>
  </div>`,
  styleUrl: './account-profile-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountProfilePanel {
  readonly rows = input.required<readonly AccountInfo[]>();
  protected readonly details = computed(() =>
    this.rows().filter(
      (row) => row.id !== 'display-name' && row.id !== 'email' && Boolean(row.value),
    ),
  );
  protected readonly icons: Readonly<Record<string, NwIconName>> = {
    'display-name': 'user-round',
    email: 'mail',
    phone: 'phone',
  };
}
