import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AccountInfo } from '../../application/account-settings-view';
import { AccountInfoRow } from './account-info-row';

@Component({
  selector: 'adm-account-profile-panel',
  imports: [AccountInfoRow],
  template: `<div class="account-profile__columns">
    <dl>
      @for (row of rows().slice(0, 2); track row.id) {
        <div adm-account-info-row [row]="row" [stacked]="true"></div>
      }
    </dl>
    <dl>
      @for (row of rows().slice(2); track row.id) {
        <div adm-account-info-row [row]="row" [stacked]="true"></div>
      }
    </dl>
  </div>`,
  styleUrl: './account-profile-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountProfilePanel {
  readonly rows = input.required<readonly AccountInfo[]>();
}
