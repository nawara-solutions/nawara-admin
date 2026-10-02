import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The card frame of the overview sections (owner design): heading, optional subtitle and an action slot
 * (`[cardActions]`, for a pill or a link). A `region` labelled by its heading; copy arrives already translated.
 */
@Component({
  selector: 'adm-overview-card',
  template: `
    <header class="overview-card__header">
      <div class="overview-card__titles">
        <h2 class="overview-card__title" [id]="headingId()">{{ heading() }}</h2>
        @if (subtitle(); as text) {
          <p class="overview-card__subtitle">{{ text }}</p>
        }
      </div>
      <div class="overview-card__actions"><ng-content select="[cardActions]" /></div>
    </header>
    <ng-content />
  `,
  styleUrl: './overview-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'overview-card',
    role: 'region',
    '[attr.aria-labelledby]': 'headingId()',
  },
})
export class OverviewCard {
  readonly heading = input.required<string>();
  readonly headingId = input.required<string>();
  readonly subtitle = input<string>();
}
