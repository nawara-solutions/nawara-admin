import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { organizationPath } from '../../../core/context/scope-context';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwDialog } from '../../../shared/ui/dialog/dialog';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwMenu, NwMenuItem, NwMenuTrigger } from '../../../shared/ui/menu/menu';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { NW_CLOCK } from '../../../shared/format/clock';
import { SubscriptionAttention } from '../domain/licenses.model';

export interface LicensesAttentionData {
  readonly items: readonly {
    readonly attention: SubscriptionAttention;
    readonly platformName: string | null;
  }[];
  readonly endingWithinDays: number;
  readonly initialFilter?: 'graceEnds' | 'ends';
}

@Component({
  selector: 'adm-licenses-attention-dialog',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwDatePipe,
    NwNumberPipe,
    NwDialog,
    NwStatusBadge,
    NwIcon,
    NwMenu,
    NwMenuItem,
    NwMenuTrigger,
  ],
  template: `
    <nw-dialog
      size="wide"
      [title]="'licenses.attention.title' | transloco"
      [closeLabel]="'common.close' | transloco"
    >
      <div class="attention-toolbar">
        <label class="attention-search"
          ><nw-icon name="search" size="sm" /><span class="nw-visually-hidden">{{
            'licenses.attention.search' | transloco
          }}</span
          ><input
            type="search"
            [placeholder]="'licenses.attention.search' | transloco"
            [value]="search()"
            (input)="setSearch($event)"
        /></label>
        <label class="attention-control"
          ><span>{{ 'operators.filters.title' | transloco }}</span
          ><select [value]="filter()" (change)="setFilter($event)">
            <option value="all">{{ 'licenses.attention.all' | transloco }}</option>
            <option value="graceEnds">{{ 'licenses.meaning.graceTerm' | transloco }}</option>
            <option value="ends">{{ 'licenses.figures.endingSoon' | transloco }}</option>
            <option value="within7">{{ 'licenses.attention.within7' | transloco }}</option>
            <option value="within14">{{ 'licenses.attention.within14' | transloco }}</option>
          </select></label
        >
        <label class="attention-control"
          ><span>{{ 'operators.toolbar.sort' | transloco }}</span
          ><select [value]="sort()" (change)="setSort($event)">
            <option value="earliest">{{ 'licenses.attention.earliest' | transloco }}</option>
            <option value="latest">{{ 'licenses.attention.latest' | transloco }}</option>
            <option value="name">{{ 'licenses.attention.name' | transloco }}</option>
          </select></label
        >
      </div>
      @if (copyStatus(); as status) {
        <p class="attention-feedback" role="status">{{ status | transloco }}</p>
      }
      @if (items().length) {
        <ul class="attention-list" role="list">
          @for (entry of pageItems(); track entry.attention.organizationId) {
            @let item = entry.attention;
            <li class="attention-list__item" [attr.data-attention]="item.reason">
              <span class="attention-list__name">
                <a
                  [routerLink]="organizationPath(item.platformId, item.organizationId)"
                  (click)="dialog.close()"
                  ><bdi>{{ item.organizationName }}</bdi></a
                >
                <span
                  ><bdi>{{
                    entry.platformName ?? ('licenses.attention.unknownPlatform' | transloco)
                  }}</bdi></span
                >
              </span>
              @if (item.reason === 'graceEnds') {
                <nw-status-badge tone="warning">{{
                  'licenses.attention.graceEnds'
                    | transloco: { at: (item.at | nwDate: 'date-time') }
                }}</nw-status-badge>
              } @else {
                <span class="attention-list__when">{{
                  'licenses.attention.ends' | transloco: { when: (item.at | nwDate: 'until') }
                }}</span>
              }
              <button
                type="button"
                class="attention-list__menu-trigger"
                [nwMenuTriggerFor]="rowMenu"
                [attr.aria-label]="
                  'licenses.attention.actionsFor'
                    | transloco: { organization: item.organizationName }
                "
              >
                <nw-icon name="ellipsis-vertical" size="sm" />
              </button>
              <ng-template #rowMenu>
                <nw-menu>
                  <button nw-menu-item (triggered)="openOrganization(item)">
                    <nw-icon name="building-2" size="sm" />{{
                      'licenses.attention.viewOrganization' | transloco
                    }}
                  </button>
                  @if (item.reason === 'ends') {
                    <button nw-menu-item (triggered)="showExpiry(item)">
                      <nw-icon name="info" size="sm" />{{
                        'licenses.attention.viewExpiry' | transloco
                      }}
                    </button>
                  }
                  <button nw-menu-item (triggered)="copyId(item)">
                    <nw-icon name="copy" size="sm" />{{ 'licenses.attention.copyId' | transloco }}
                  </button>
                </nw-menu>
              </ng-template>
              @if (expiryId() === item.organizationId && item.reason === 'ends') {
                <div class="attention-list__details">
                  <strong>{{ 'licenses.attention.expiresAt' | transloco }}</strong
                  ><span>{{ item.at | nwDate: 'date-time' }}</span
                  ><span>{{ 'licenses.meaning.active' | transloco }}</span>
                </div>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="attention-list__empty">
          {{
            (data.items.length ? 'licenses.attention.noMatches' : 'licenses.attention.none')
              | transloco: { days: data.endingWithinDays }
          }}
        </p>
      }
      <nav
        class="attention-pagination"
        [attr.aria-label]="'licenses.attention.pagination' | transloco"
      >
        <span class="attention-pagination__count" aria-live="polite">{{
          'operators.pagination.range'
            | transloco
              : {
                  first: (firstItem() | nwNumber),
                  last: (lastItem() | nwNumber),
                  total: (items().length | nwNumber),
                }
        }}</span>
        <label class="attention-pagination__size"
          >{{ 'operators.pagination.perPage' | transloco }}
          <select [value]="pageSize()" (change)="setPageSize($event)">
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="50">50</option>
          </select>
        </label>
        <div class="attention-pagination__buttons">
          <button
            type="button"
            [disabled]="page() === 0"
            (click)="page.set(page() - 1)"
            [attr.aria-label]="'operators.pagination.previous' | transloco"
          >
            <nw-icon name="chevron-left" size="sm" />
          </button>
          <button
            type="button"
            [disabled]="page() + 1 >= pageCount()"
            (click)="page.set(page() + 1)"
            [attr.aria-label]="'operators.pagination.next' | transloco"
          >
            <nw-icon name="chevron-right" size="sm" />
          </button>
        </div>
      </nav>
    </nw-dialog>
  `,
  styles: `
    .attention-toolbar {
      display: grid;
      grid-template-columns: minmax(12rem, 1fr) minmax(8rem, auto) minmax(10rem, auto);
      align-items: end;
      gap: 0.75rem;
      margin-block: 0.75rem 1.25rem;
    }
    .attention-search {
      display: flex;
      align-items: center;
      flex: 1 1 12rem;
      gap: 0.5rem;
      min-inline-size: 0;
      padding: 0 0.75rem;
      min-block-size: 2.5rem;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-md);
      color: var(--nw-text-secondary);
    }
    .attention-search:focus-within {
      border-color: var(--nw-text-brand);
      outline: 2px solid var(--nw-focus-ring);
    }
    .attention-search input {
      min-inline-size: 0;
      inline-size: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--nw-text-primary);
      font: inherit;
      font-size: var(--nw-text-size-sm);
    }
    .attention-control {
      display: grid;
      gap: 0.25rem;
      color: var(--nw-text-secondary);
      font-size: 0.75rem;
    }
    .attention-control select {
      min-block-size: 2.5rem;
      inline-size: 100%;
      padding: 0.375rem 0.625rem;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-md);
      background: var(--nw-surface-raised);
      color: var(--nw-text-primary);
      font: inherit;
      cursor: pointer;
    }
    .attention-control select:focus-visible {
      outline: 2px solid var(--nw-focus-ring);
      outline-offset: 2px;
    }
    .attention-list {
      display: grid;
      overflow: hidden;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-lg);
    }
    .attention-list__item {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 1rem 1.125rem;
      border-block-end: 1px solid var(--nw-border-subtle);
    }
    .attention-list__item:last-child {
      border-block-end: 0;
    }
    .attention-list__name {
      display: grid;
      flex: 1 1 12rem;
      gap: 0.25rem;
      min-inline-size: 0;
    }
    .attention-list__name a {
      color: var(--nw-text-primary);
      font-weight: var(--nw-font-weight-semibold);
      text-decoration: none;
    }
    .attention-list__name a:hover {
      color: var(--nw-text-brand);
      text-decoration: underline;
    }
    .attention-list__name a:focus-visible {
      outline: 2px solid var(--nw-focus-ring);
      outline-offset: 2px;
    }
    .attention-list__name span,
    .attention-list__when,
    .attention-list__empty {
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-sm);
    }
    .attention-list__menu-trigger {
      display: inline-grid;
      place-items: center;
      inline-size: 2.25rem;
      block-size: 2.25rem;
      border: 0;
      border-radius: var(--nw-radius-md);
      background: transparent;
      color: var(--nw-text-secondary);
      cursor: pointer;
    }
    .attention-list__menu-trigger:hover {
      background: var(--nw-surface-brand-subtle);
      color: var(--nw-text-brand);
    }
    .attention-list__menu-trigger:focus-visible {
      outline: 2px solid var(--nw-focus-ring);
      outline-offset: 2px;
    }
    .attention-list__details {
      display: grid;
      flex: 1 0 100%;
      gap: 0.25rem;
      padding: 0.75rem;
      border-radius: var(--nw-radius-md);
      background: var(--nw-surface-sunken);
      font-size: var(--nw-text-size-sm);
    }
    .attention-feedback {
      color: var(--nw-text-primary);
      font-size: var(--nw-text-size-sm);
    }
    .attention-pagination {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      padding-block-start: 1rem;
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-sm);
    }
    .attention-pagination__count {
      margin-inline-end: auto;
      font-variant-numeric: tabular-nums;
    }
    .attention-pagination__size {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .attention-pagination__size select,
    .attention-pagination__buttons button {
      min-block-size: 2.25rem;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-md);
      background: var(--nw-surface-raised);
      color: var(--nw-text-primary);
    }
    .attention-pagination__size select {
      padding-inline: 0.625rem;
      font: inherit;
    }
    .attention-pagination__buttons {
      display: flex;
      gap: 0.375rem;
    }
    .attention-pagination__buttons button {
      display: inline-grid;
      place-items: center;
      inline-size: 2.25rem;
      cursor: pointer;
    }
    .attention-pagination__buttons button:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .attention-pagination__buttons button:hover:not(:disabled) {
      color: var(--nw-text-brand);
      border-color: var(--nw-border-brand);
    }
    .attention-pagination__buttons button:focus-visible,
    .attention-pagination__size select:focus-visible {
      outline: 2px solid var(--nw-focus-ring);
      outline-offset: 2px;
    }
    @media (max-width: 40rem) {
      .attention-toolbar {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .attention-search {
        grid-column: 1 / -1;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LicensesAttentionDialog {
  protected readonly data = inject<LicensesAttentionData>(DIALOG_DATA);
  protected readonly dialog = inject(DialogRef);
  protected readonly organizationPath = organizationPath;
  protected readonly search = signal('');
  protected readonly filter = signal<'all' | 'graceEnds' | 'ends' | 'within7' | 'within14'>(this.data.initialFilter ?? 'all');
  protected readonly sort = signal<'earliest' | 'latest' | 'name'>('earliest');
  protected readonly expiryId = signal<string | null>(null);
  protected readonly copyStatus = signal<string | null>(null);
  protected readonly pageSize = signal<5 | 10 | 50>(5);
  protected readonly page = signal(0);
  private readonly clock = inject(NW_CLOCK);
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly toast = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);
  protected readonly items = computed(() => {
    const search = this.search().trim().toLocaleLowerCase();
    const filter = this.filter();
    const sort = this.sort();
    return this.data.items
      .filter(
        ({ attention, platformName }) =>
          (filter === 'all' ||
            attention.reason === filter ||
            ((filter === 'within7' || filter === 'within14') &&
              attention.reason === 'ends' &&
              Date.parse(attention.at) >= this.clock() &&
              Date.parse(attention.at) <=
                this.clock() + (filter === 'within7' ? 7 : 14) * 86400000)) &&
          (!search ||
            `${attention.organizationName} ${platformName ?? ''}`
              .toLocaleLowerCase()
              .includes(search)),
      )
      .sort((a, b) =>
        sort === 'name'
          ? a.attention.organizationName.localeCompare(b.attention.organizationName)
          : (sort === 'latest' ? -1 : 1) *
            (Date.parse(a.attention.at) - Date.parse(b.attention.at)),
      );
  });
  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.items().length / this.pageSize())),
  );
  protected readonly pageItems = computed(() =>
    this.items().slice(this.page() * this.pageSize(), (this.page() + 1) * this.pageSize()),
  );
  protected readonly firstItem = computed(() =>
    this.items().length ? this.page() * this.pageSize() + 1 : 0,
  );
  protected readonly lastItem = computed(() =>
    Math.min((this.page() + 1) * this.pageSize(), this.items().length),
  );
  protected setPageSize(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (value === 5 || value === 10 || value === 50) {
      this.pageSize.set(value);
      this.page.set(0);
    }
  }
  protected setFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (
      value === 'all' ||
      value === 'graceEnds' ||
      value === 'ends' ||
      value === 'within7' ||
      value === 'within14'
    ) {
      this.filter.set(value);
      this.page.set(0);
    }
  }
  protected async openOrganization(item: SubscriptionAttention): Promise<void> {
    if (await this.router.navigateByUrl(organizationPath(item.platformId, item.organizationId)))
      this.dialog.close();
  }
  protected showExpiry(item: SubscriptionAttention): void {
    this.expiryId.set(this.expiryId() === item.organizationId ? null : item.organizationId);
  }
  protected async copyId(item: SubscriptionAttention): Promise<void> {
    try {
      const clipboard = this.document.defaultView?.navigator.clipboard;
      if (!clipboard) throw new Error('Clipboard unavailable');
      await clipboard.writeText(item.organizationId);
      this.copyStatus.set('licenses.attention.copied');
      this.toast.show(this.transloco.translate('licenses.attention.copied'), { tone: 'success' });
    } catch {
      this.copyStatus.set('licenses.attention.copyFailed');
    }
  }
  protected setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(0);
  }
  protected setSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'earliest' || value === 'latest' || value === 'name') {
      this.sort.set(value);
      this.page.set(0);
    }
  }
}
