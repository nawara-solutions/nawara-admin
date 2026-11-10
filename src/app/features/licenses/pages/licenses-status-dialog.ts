import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDialog } from '../../../shared/ui/dialog/dialog';
import { NwIcon } from '../../../shared/ui/icon/icon';

@Component({
  selector: 'adm-licenses-status-dialog',
  imports: [NwDialog, NwIcon, TranslocoPipe],
  template: `
    <nw-dialog
      size="side"
      [title]="'licenses.meaning.title' | transloco"
      [closeLabel]="'common.close' | transloco"
    >
      <dl class="status-list">
        <div class="status-list__item status-list__item--active">
          <dt>{{ 'licenses.meaning.activeTerm' | transloco }}</dt>
          <dd>{{ 'licenses.meaning.active' | transloco }}</dd>
        </div>
        <div class="status-list__item status-list__item--grace">
          <dt>{{ 'licenses.meaning.graceTerm' | transloco }}</dt>
          <dd>{{ 'licenses.meaning.grace' | transloco: { hours: data.graceHours } }}</dd>
        </div>
        <div class="status-list__item status-list__item--none">
          <dt>{{ 'licenses.meaning.noneTerm' | transloco }}</dt>
          <dd>{{ 'licenses.meaning.none' | transloco }}</dd>
        </div>
      </dl>
      <p class="status-note">
        <nw-icon name="users" size="sm" /><span>{{
          'licenses.meaning.membership' | transloco
        }}</span>
      </p>
    </nw-dialog>
  `,
  styles: `
    .status-list {
      display: grid;
      gap: 1.25rem;
      margin: 0;
    }
    .status-list__item {
      display: grid;
      gap: 0.375rem;
      padding-inline-start: 1.125rem;
      position: relative;
    }
    .status-list__item::before {
      content: '';
      position: absolute;
      inset-inline-start: 0;
      inset-block-start: 0.5rem;
      inline-size: 0.5rem;
      block-size: 0.5rem;
      border-radius: 50%;
      background: var(--status-color);
    }
    .status-list__item--active {
      --status-color: var(--nw-status-success-fg);
    }
    .status-list__item--grace {
      --status-color: var(--nw-status-warning-fg);
    }
    .status-list__item--none {
      --status-color: var(--nw-status-danger-fg);
    }
    dt {
      font-weight: var(--nw-font-weight-semibold);
    }
    dd {
      margin: 0;
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-sm);
    }
    .status-note {
      display: flex;
      align-items: flex-start;
      gap: 0.625rem;
      margin: 1.5rem 0 0;
      padding: 1rem;
      border-radius: var(--nw-radius-md);
      background: var(--nw-surface-sunken);
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-sm);
    }
    .status-note nw-icon {
      flex: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LicensesStatusDialog {
  protected readonly data = inject<{ graceHours: number }>(DIALOG_DATA);
}
