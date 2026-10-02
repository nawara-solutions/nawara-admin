import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/**
 * A link-styled action of the owner design ("Manage →", "Audit log →", "Account security ›") whose destination is not
 * built yet: rendered disabled, with "Not available yet" as its tooltip and accessible description.
 */
@Component({
  selector: 'adm-card-link',
  imports: [TranslocoPipe, NwIcon],
  template: `
    <button
      type="button"
      class="card-link__button"
      disabled
      [class.card-link__button--row]="chevron()"
      [title]="'shell.notAvailableYet' | transloco"
    >
      {{ label() }}
      <nw-icon [name]="chevron() ? 'chevron-right' : 'arrow-right'" size="sm" />
      <span class="nw-visually-hidden">({{ 'shell.notAvailableYet' | transloco }})</span>
    </button>
  `,
  styles: `
    :host {
      display: contents;
    }

    .card-link__button {
      display: inline-flex;
      align-items: center;
      gap: var(--nw-space-1);
      padding: 0;
      border: 0;
      background: transparent;
      color: var(--nw-text-link);
      font: inherit;
      font-size: 0.8125rem;
      font-weight: var(--nw-font-weight-semibold);
      white-space: nowrap;
      opacity: 0.72;
      cursor: not-allowed;

      &--row {
        justify-content: space-between;
        inline-size: 100%;
        padding-block-start: 0.625rem;
        border-block-start: 1px solid var(--nw-border-hairline);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card-link' },
})
export class CardLink {
  /** Already translated. */
  readonly label = input.required<string>();
  /** A full-width row with a chevron (tile footers) rather than an inline arrow link (card headers). */
  readonly chevron = input(false, { transform: booleanAttribute });
}
