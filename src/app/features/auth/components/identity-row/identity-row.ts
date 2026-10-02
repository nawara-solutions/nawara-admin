import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/** "Signed in as" and the account's email (a machine value, kept left-to-right), with an optional role pill. */
@Component({
  selector: 'adm-identity-row',
  imports: [NwIcon],
  template: `
    <span class="identity-row__avatar"><nw-icon name="user-round" /></span>
    <span class="identity-row__text">
      <span class="identity-row__label">{{ label() }}</span>
      <bdi class="identity-row__email" dir="ltr">{{ email() }}</bdi>
    </span>
    @if (role(); as text) {
      <span class="identity-row__role">{{ text }}</span>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--nw-space-3);
      padding: var(--nw-space-3) 0.875rem;
      border: 1px solid var(--nw-border-hairline);
      border-radius: 0.75rem;
      background-color: var(--nw-surface-inset);
    }

    .identity-row__avatar {
      display: inline-grid;
      flex-shrink: 0;
      place-items: center;
      inline-size: 2.25rem;
      block-size: 2.25rem;
      border-radius: var(--nw-radius-pill);
      background-color: var(--nw-accent-purple-bg);
      color: var(--nw-accent-purple-fg);
    }

    .identity-row__text {
      display: grid;
      flex: 1;
      gap: 1px;
      min-inline-size: 0;
      line-height: 1.4;
    }

    .identity-row__label {
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-xs);
    }

    .identity-row__email {
      overflow: hidden;
      font-size: var(--nw-text-size-sm);
      font-weight: var(--nw-font-weight-semibold);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :host(:dir(rtl)) .identity-row__email {
      text-align: right;
    }

    .identity-row__role {
      flex-shrink: 0;
      padding: 0.125rem var(--nw-space-2);
      border-radius: var(--nw-radius-pill);
      background-color: var(--nw-surface-sunken);
      color: var(--nw-text-label);
      font-size: var(--nw-text-size-xs);
      font-weight: var(--nw-font-weight-semibold);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'identity-row' },
})
export class IdentityRow {
  readonly label = input.required<string>();
  readonly email = input.required<string>();
  readonly role = input<string>();
}
