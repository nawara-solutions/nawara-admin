import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NgTemplateOutlet } from '@angular/common';
import { NwSkeleton } from '../../../../shared/ui/skeleton/skeleton';
import { AccountSettingsView } from '../../application/account-settings-view';
import { AccountInfoRow } from './account-info-row';

@Component({
  selector: 'adm-account-access-panel',
  imports: [AccountInfoRow, TranslocoPipe, NwIcon, NwSkeleton, NwButton, NgTemplateOutlet],
  template: `<dl class="account-panel__access-facts">
      @for (row of access().rows; track row.id) {
        <div adm-account-info-row [row]="row"></div>
      }
    </dl>
    <h4>{{ access().entryLabel | transloco }}</h4>
    @let entries = access().entries;
    @switch (entries.status) {
      @case ('success') {
        <ul class="account-panel__entries" role="list">
          @for (entry of entries.data; track entry.id) {
            <li data-platform>
              <nw-icon name="building-2" size="sm" /><bdi>{{ entry.name }}</bdi>
            </li>
          }
        </ul>
      }
      @case ('empty') {
        <p data-no-platforms>{{ access().emptyDescription | transloco }}</p>
      }
      @case ('error') {
        <ng-container *ngTemplateOutlet="unavailable" />
      }
      @case ('forbidden') {
        <ng-container *ngTemplateOutlet="unavailable" />
      }
      @default {
        <div role="status">
          <span class="nw-visually-hidden">{{ 'shell.context.loading' | transloco }}</span
          ><nw-skeleton [lines]="2" />
        </div>
      }
    }
    <ng-template #unavailable
      ><div data-platforms-unavailable>
        <p>{{ access().unavailableDescription | transloco }}</p>
        <button nw-button variant="secondary" size="sm" type="button" (click)="retry.emit()">
          {{ 'settings.account.retry' | transloco }}
        </button>
      </div></ng-template
    >
    @if (access().note; as note) {
      <p class="account-panel__note">{{ note | transloco }}</p>
    }`,
  styleUrl: './account-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountAccessPanel {
  readonly access = input.required<AccountSettingsView['access']>();
  readonly retry = output<void>();
}
