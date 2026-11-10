import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwButton } from '../../../../shared/ui/button/button';
import type { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { AccountInfo } from '../../application/account-settings-view';

@Component({
  selector: 'adm-account-profile-panel',
  imports: [TranslocoPipe, NwIcon, NwButton],
  template: `<dl class="account-profile__rows">
      @for (row of rows(); track row.id) {
        <div class="account-profile__row">
          <dt>
            <nw-icon [name]="icons[row.id] ?? 'id-card'" size="sm" />{{ row.label | transloco }}
          </dt>
          <dd [attr.data-fact]="row.id">
            @if (row.value; as value) {
              <bdi [attr.dir]="row.machine ? 'ltr' : null" translate="no">{{
                row.translated ? (value | transloco) : value
              }}</bdi>
            } @else {
              <span class="account-profile__missing">{{
                'settings.account.unavailable' | transloco
              }}</span>
            }
          </dd>
          @if (row.id === 'email' && row.value) {
            <button
              nw-button
              variant="outline"
              size="sm"
              type="button"
              class="account-profile__copy"
              [attr.aria-label]="'settings.account.copyEmail' | transloco"
              (click)="copyEmail(row.value)"
            >
              <nw-icon [name]="copyStatus() === 'copied' ? 'check' : 'copy'" size="sm" />{{
                (copyStatus() === 'copied' ? 'settings.account.copied' : 'settings.account.copy')
                  | transloco
              }}
            </button>
          }
        </div>
      }
    </dl>
    <p class="account-profile__copy-status" [hidden]="!copyStatus()" role="status">
      {{
        copyStatus() === 'failed'
          ? ('settings.account.copyFailed' | transloco)
          : copyStatus() === 'copied'
            ? ('settings.account.emailCopied' | transloco)
            : ''
      }}
    </p>`,
  styleUrl: './account-profile-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountProfilePanel {
  readonly rows = input.required<readonly AccountInfo[]>();
  private readonly document = inject(DOCUMENT);
  protected readonly copyStatus = signal<'copied' | 'failed' | null>(null);
  protected readonly icons: Readonly<Record<string, NwIconName>> = {
    'display-name': 'user-round',
    email: 'mail',
    phone: 'phone',
  };

  constructor() {
    effect(() => {
      this.rows();
      this.copyStatus.set(null);
    });
  }

  protected async copyEmail(value: string): Promise<void> {
    try {
      const clipboard = this.document.defaultView?.navigator.clipboard;
      if (!clipboard) throw new Error('Clipboard unavailable');
      await clipboard.writeText(value);
      this.copyStatus.set('copied');
    } catch {
      this.copyStatus.set('failed');
    }
  }
}
