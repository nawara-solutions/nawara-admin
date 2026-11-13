import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NwButton } from '../../../shared/ui/button/button';
import { NwIcon } from '../../../shared/ui/icon/icon';
import {
  OrganizationActivityAction,
  OrganizationActivityEntry,
} from '../domain/organization.model';
import {
  ORGANIZATION_ACTIVITY_ACTIONS,
  OrganizationActivity,
} from './organization-activity/organization-activity';

export interface OrganizationActivityPanelData {
  entries: readonly OrganizationActivityEntry[] | null;
  platformId: string;
  organizationId: string;
  canBrowse: boolean;
}

@Component({
  selector: 'adm-organization-activity-panel',
  imports: [RouterLink, TranslocoPipe, NwButton, NwIcon, OrganizationActivity],
  template: `
    @if (data().entries; as entries) {
      <div class="toolbar" role="search">
        <label class="search"
          ><nw-icon name="search" size="sm" /><span class="nw-visually-hidden">{{
            'platformDashboard.activity.search' | transloco
          }}</span
          ><input
            type="search"
            [placeholder]="'platformDashboard.activity.search' | transloco"
            [value]="search()"
            (input)="search.set($any($event.target).value)"
        /></label>
        <button
          nw-button
          variant="secondary"
          type="button"
          [attr.aria-expanded]="menu() === 'filter'"
          (click)="menu.set(menu() === 'filter' ? null : 'filter')"
        >
          <nw-icon name="sliders-horizontal" size="sm" />{{ 'operators.filters.title' | transloco }}
        </button>
        <button
          nw-button
          variant="secondary"
          type="button"
          [attr.aria-expanded]="menu() === 'sort'"
          (click)="menu.set(menu() === 'sort' ? null : 'sort')"
        >
          <nw-icon name="chevrons-up-down" size="sm" />{{
            'organizations.toolbar.sort' | transloco
          }}
        </button>
        <button
          nw-button
          variant="ghost"
          type="button"
          [disabled]="!search() && filter() === 'all' && sort() === 'newest'"
          (click)="search.set(''); filter.set('all'); sort.set('newest'); menu.set(null)"
        >
          <nw-icon name="rotate-ccw" size="sm" />{{ 'operators.toolbar.resetAll' | transloco }}
        </button>
      </div>
      @if (menu() === 'filter') {
        <fieldset>
          <legend>{{ 'platformDashboard.activity.filterAction' | transloco }}</legend>
          <label
            ><input
              type="radio"
              name="activity-filter"
              [checked]="filter() === 'all'"
              (change)="filter.set('all'); menu.set(null)"
            />{{ 'organizations.toolbar.all' | transloco }}</label
          >
          @for (action of actions(); track action) {
            <label
              ><input
                type="radio"
                name="activity-filter"
                [checked]="filter() === action"
                (change)="filter.set(action); menu.set(null)"
              />{{ labels[action].key | transloco }}</label
            >
          }
        </fieldset>
      }
      @if (menu() === 'sort') {
        <fieldset>
          <legend>{{ 'organizations.toolbar.sort' | transloco }}</legend>
          <label
            ><input
              type="radio"
              name="activity-sort"
              [checked]="sort() === 'newest'"
              (change)="sort.set('newest'); menu.set(null)"
            />{{ 'organizations.sort.newest' | transloco }}</label
          >
          <label
            ><input
              type="radio"
              name="activity-sort"
              [checked]="sort() === 'oldest'"
              (change)="sort.set('oldest'); menu.set(null)"
            />{{ 'organizations.sort.oldest' | transloco }}</label
          >
        </fieldset>
      }
      @if (filtered().length === 0 && entries.length > 0) {
        <p class="empty">{{ 'platformDashboard.activity.noMatches' | transloco }}</p>
      } @else {
        <adm-organization-activity [entries]="filtered()" />
      }
    } @else {
      <p>{{ 'organizations.states.sectionUnavailable' | transloco }}</p>
    }
    @if (data().canBrowse) {
      <a
        class="activity-link"
        (click)="close()"
        routerLink="/audit"
        [queryParams]="{ platform: data().platformId, organization: data().organizationId }"
        >{{ 'organizations.detail.openActivity' | transloco }}</a
      >
    }
  `,
  styles: `
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.625rem;
      align-items: center;
      margin-block-end: 1.25rem;
    }
    .search {
      display: flex;
      flex: 1 1 100%;
      align-items: center;
      gap: 0.5rem;
      min-block-size: 2.75rem;
      padding-inline: 0.75rem;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-md);
      background: var(--nw-surface-sunken);
      color: var(--nw-text-secondary);
    }
    .search input {
      flex: 1;
      min-inline-size: 0;
      border: 0;
      outline: 0;
      background: transparent;
      color: var(--nw-text-primary);
      font: inherit;
    }
    .search:focus-within {
      outline: 2px solid var(--nw-focus-ring);
    }
    fieldset {
      display: grid;
      gap: 0.5rem;
      margin: 0 0 1.25rem;
      padding: 1rem;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-md);
    }
    fieldset label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    input[type='radio'] {
      accent-color: var(--nw-color-primary);
    }
    .empty {
      color: var(--nw-text-secondary);
    }
    .activity-link {
      display: inline-block;
      margin-block-start: 1.5rem;
      color: var(--nw-text-link);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationActivityPanel {
  readonly data = input.required<OrganizationActivityPanelData>();
  private readonly dialogRef = inject(DialogRef);
  protected close(): void {
    this.dialogRef.close();
  }
  private readonly translations = inject(TranslocoService);
  protected readonly labels = ORGANIZATION_ACTIVITY_ACTIONS;
  protected readonly search = signal('');
  protected readonly filter = signal<OrganizationActivityAction | 'all'>('all');
  protected readonly sort = signal<'newest' | 'oldest'>('newest');
  protected readonly menu = signal<'filter' | 'sort' | null>(null);
  protected readonly actions = computed(() => [
    ...new Set((this.data().entries ?? []).map((entry) => entry.action)),
  ]);
  protected readonly filtered = computed(() => {
    const needle = this.search().trim().toLocaleLowerCase();
    return (this.data().entries ?? [])
      .filter(
        (entry) =>
          (this.filter() === 'all' || entry.action === this.filter()) &&
          this.translations
            .translate(this.labels[entry.action].key)
            .toLocaleLowerCase()
            .includes(needle),
      )
      .slice()
      .sort(
        (a, b) =>
          (Date.parse(a.occurredAt) - Date.parse(b.occurredAt)) *
          (this.sort() === 'oldest' ? 1 : -1),
      );
  });
}
