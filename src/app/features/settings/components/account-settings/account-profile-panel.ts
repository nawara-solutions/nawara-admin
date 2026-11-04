import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AccountInfo } from '../../application/account-settings-view';
import { AccountInfoRow } from './account-info-row';

@Component({
  selector: 'adm-account-profile-panel',
  imports: [AccountInfoRow],
  template: `<dl>
    @for (row of rows(); track row.id) {
      <div adm-account-info-row [row]="row"></div>
    }
  </dl>`,
  styleUrl: './account-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountProfilePanel {
  readonly rows = input.required<readonly AccountInfo[]>();
}
