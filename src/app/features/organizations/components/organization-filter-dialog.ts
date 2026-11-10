import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, OnInit, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton } from '../../../shared/ui/button/button';
import { DEFAULT_QUERY, OrganizationQuery } from '../application/organization-query';

export interface OrganizationFilterData {
  mode: 'filters' | 'sort';
  query: OrganizationQuery;
  groups: readonly {
    field: keyof OrganizationQuery;
    label: string;
    options: readonly { value: string; label?: string; key?: string }[];
  }[];
}

@Component({
  selector: 'adm-organization-filter-dialog',
  imports: [TranslocoPipe, NwButton, CdkTrapFocus],
  template: `
    <section
      class="popup"
      role="dialog"
      cdkTrapFocus
      [cdkTrapFocusAutoCapture]="true"
      [attr.aria-label]="
        (data().mode === 'sort' ? 'operators.toolbar.sort' : 'operators.filters.title') | transloco
      "
    >
      <h3>
        {{
          (data().mode === 'sort' ? 'operators.toolbar.sort' : 'operators.filters.title')
            | transloco
        }}
      </h3>
      <div class="filters">
        @for (group of data().groups; track group.field) {
          <fieldset>
            <legend [class.nw-visually-hidden]="data().mode === 'sort'">
              {{ group.label | transloco }}
            </legend>
            <div class="options">
              @for (option of group.options; track option.value) {
                <label [class.selected]="draft()[group.field] + '' === option.value">
                  <input
                    type="radio"
                    [name]="group.field"
                    [value]="option.value"
                    [checked]="draft()[group.field] + '' === option.value"
                    (change)="choose(group.field, option.value)"
                  />
                  <span>{{ option.label ?? (option.key! | transloco: { days: 14 }) }}</span>
                </label>
              }
            </div>
          </fieldset>
        }
      </div>
      <div class="actions">
        <button nw-button variant="ghost" type="button" (click)="reset()">
          {{ 'operators.filters.reset' | transloco }}
        </button>
        <button nw-button variant="secondary" type="button" (click)="closed.emit(undefined)">
          {{ 'common.cancel' | transloco }}
        </button>
        <button nw-button type="button" (click)="closed.emit(draft())">
          {{ 'operators.filters.apply' | transloco }}
        </button>
      </div>
    </section>
  `,
  styles: `
    .popup {
      inline-size: min(24rem, calc(100vw - 2rem));
      max-block-size: min(36rem, calc(100dvh - 2rem));
      overflow: auto;
      padding: 1rem;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-lg);
      background: var(--nw-surface-overlay);
      color: var(--nw-text-primary);
      box-shadow: var(--nw-shadow-lg);
    }
    h3 {
      margin: 0 0 1rem;
      font-size: 0.875rem;
      font-weight: 500;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      justify-content: flex-end;
      padding-block-start: 1rem;
      margin-block-start: 1rem;
      border-block-start: 1px solid var(--nw-border-subtle);
    }

    .filters {
      display: grid;
      gap: 1rem;
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      min-inline-size: 0;
    }
    legend {
      margin-block-end: 0.625rem;
      color: var(--nw-text-secondary);
      font-size: 0.75rem;
      font-weight: 500;
    }
    .options {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25rem;
    }
    label {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      padding: 0.625rem;
      border: 1px solid transparent;
      border-radius: var(--nw-radius-md);
      color: var(--nw-text-primary);
      font-size: 0.8125rem;
      cursor: pointer;
    }
    label:hover,
    .selected {
      background: var(--nw-surface-brand-subtle);
      border-color: var(--nw-border-brand);
    }
    input {
      flex: none;
      margin: 0;
      inline-size: 1rem;
      block-size: 1rem;
      accent-color: var(--nw-color-primary);
    }
    label:focus-within {
      outline: 2px solid var(--nw-focus-ring);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationFilterDialog implements OnInit {
  readonly data = input.required<OrganizationFilterData>();
  readonly closed = output<OrganizationQuery | undefined>();
  protected readonly draft = signal(DEFAULT_QUERY);
  ngOnInit(): void {
    this.draft.set(this.data().query);
  }
  protected readonly defaults = DEFAULT_QUERY;
  protected reset(): void {
    this.draft.update((query) =>
      this.data().mode === 'sort'
        ? { ...query, sort: this.defaults.sort }
        : { ...query, requests: this.defaults.requests, subscription: this.defaults.subscription },
    );
  }
  protected choose(field: keyof OrganizationQuery, value: string): void {
    this.draft.update((query) => ({
      ...query,
      [field]: field === 'requests' ? value === 'true' : value,
    }));
  }
}
