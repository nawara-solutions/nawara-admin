import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * The appearance panel's density levels (1 to 5), extracted with their styles (WP-5.2b) and otherwise unchanged. It
 * renders inside the panel's own `.appearance-panel__density-options` element and mirrors the panel's presentation
 * class on it. Presentation only: the panel's draft owns the density; this component reports the choice.
 */
@Component({
  selector: 'div[adm-appearance-density]',
  templateUrl: './appearance-density.html',
  styleUrl: './appearance-density.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.appearance-panel--workspace]': "presentation() === 'grid'",
    '[class.appearance-panel--picker]': "presentation() === 'picker'",
  },
})
export class AppearanceDensity {
  readonly presentation = input.required<'picker' | 'grid'>({ alias: 'adm-appearance-density' });
  readonly density = input.required<number>();
  /** The radio group's name. */
  readonly name = input.required<string>();
  readonly choose = output<number>();
  protected readonly levels = [1, 2, 3, 4, 5] as const;
}
