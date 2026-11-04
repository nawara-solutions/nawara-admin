import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
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
  template: `<div class="account-panel__access-facts">
      <dl>
        @for (row of access().rows; track row.id) {
          <div
            adm-account-info-row
            [row]="row"
            [icon]="row.id === 'scope' ? 'shield-check' : 'id-card'"
            [badge]="row.id === 'type'"
          ></div>
        }
      </dl>
      <div class="account-panel__current-context">
        <h4><nw-icon name="building-2" size="sm" />{{ access().entryLabel | transloco }}</h4>
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
      </div>
    </div>
    @if (access().entries.status === 'success') {
      <section class="account-panel__overview" aria-labelledby="account-access-overview">
        <h4 id="account-access-overview">{{ 'settings.account.accessOverview' | transloco }}</h4>
        <p>{{ 'settings.account.accessOverviewNote' | transloco }}</p>
        <div class="account-panel__cards">
          @for (entry of entriesForCards(); track entry.id) {
            <article>
              <nw-icon name="building-2" />
              <h5>{{ access().entryLabel | transloco }}</h5>
              <bdi>{{ entry.name }}</bdi>
            </article>
          }
          @for (row of scopeRows(); track row.id) {
            <article>
              <nw-icon name="shield-check" />
              <h5>{{ row.label | transloco }}</h5>
              <span>{{ row.translated ? (row.value ?? '' | transloco) : row.value }}</span>
            </article>
          }
        </div>
      </section>
    }
    <p class="account-panel__read-only">
      <nw-icon name="info" size="sm" />{{ 'settings.account.readOnlyNote' | transloco }}
    </p>
    @if (access().note; as note) {
      <p class="account-panel__note">{{ note | transloco }}</p>
    }`,
  styleUrl: './account-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountAccessPanel {
  readonly access = input.required<AccountSettingsView['access']>();
  readonly retry = output<void>();
  protected readonly scopeRows = computed(() =>
    this.access().rows.filter((row) => row.id === 'scope'),
  );
  protected readonly entriesForCards = computed(() => {
    const entries = this.access().entries;
    return entries.status === 'success' ? entries.data : [];
  });
}
