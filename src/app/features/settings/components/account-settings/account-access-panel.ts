import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwSkeleton } from '../../../../shared/ui/skeleton/skeleton';
import { ProductSymbol } from '../../../../shared/ui/product-symbol/product-symbol';
import { AccountSettingsView } from '../../application/account-settings-view';
import { AccountInfoRow } from './account-info-row';

@Component({
  selector: 'adm-account-access-panel',
  imports: [AccountInfoRow, TranslocoPipe, NwIcon, NwSkeleton, NwButton, ProductSymbol],
  template: `<dl class="account-panel__cards">
      @for (row of access().rows; track row.id) {
        <div
          adm-account-info-row
          [row]="row"
          [icon]="row.id === 'scope' ? 'shield-check' : 'id-card'"
          [badge]="row.id === 'type'"
          [tile]="true"
        ></div>
      }
      <div class="account-panel__context-row">
        <dt><nw-icon name="building-2" size="sm" />{{ access().entryLabel | transloco }}</dt>
        <dd>
          @let entries = access().entries;
          @switch (entries.status) {
            @case ('success') {
              <ul class="account-panel__entries" role="list">
                @for (entry of entries.data; track entry.id) {
                  <li data-platform>
                    @if (entry.brand === 'solutions') {
                      <nw-product-symbol />
                    } @else {
                      <nw-icon name="building-2" size="sm" />
                    }
                    <bdi translate="no">{{ entry.name }}</bdi>
                  </li>
                }
              </ul>
            }
            @case ('empty') {
              <p data-no-platforms>{{ access().emptyDescription | transloco }}</p>
            }
            @case ('error') {
              <div data-platforms-unavailable>
                <p>{{ access().unavailableDescription | transloco }}</p>
                <button
                  nw-button
                  variant="secondary"
                  size="sm"
                  type="button"
                  (click)="retry.emit()"
                >
                  {{ 'settings.account.retry' | transloco }}
                </button>
              </div>
            }
            @case ('forbidden') {
              <div data-platforms-unavailable>
                <p>{{ access().unavailableDescription | transloco }}</p>
                <button
                  nw-button
                  variant="secondary"
                  size="sm"
                  type="button"
                  (click)="retry.emit()"
                >
                  {{ 'settings.account.retry' | transloco }}
                </button>
              </div>
            }
            @default {
              <div role="status">
                <span class="nw-visually-hidden">{{ 'shell.context.loading' | transloco }}</span
                ><nw-skeleton [lines]="2" />
              </div>
            }
          }
        </dd>
      </div>
    </dl>
    @if (access().note; as note) {
      <p class="account-panel__note">{{ note | transloco }}</p>
    }
    <p class="account-panel__read-only">
      <nw-icon name="info" size="sm" />{{ 'settings.account.readOnlyNote' | transloco }}
    </p>`,
  styleUrl: './account-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountAccessPanel {
  readonly access = input.required<AccountSettingsView['access']>();
  readonly retry = output<void>();
}
