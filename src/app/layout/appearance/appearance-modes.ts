import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemePreference } from '../../core/theme/theme.service';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwIconName } from '../../shared/ui/icon/icon.registry';

export interface AppearanceModeChoice {
  readonly value: ThemePreference;
  readonly icon: NwIconName;
  readonly labelKey: string;
  readonly hintKey: string;
}

/**
 * The appearance panel's mode choices (light, dark, system), extracted with their styles (WP-5.2b). It renders inside
 * the panel's own `.appearance-panel__modes` element and mirrors the panel's presentation class on it. Presentation
 * only: the panel's draft owns the preference; this component reports the choice.
 */
@Component({
  selector: 'div[adm-appearance-modes]',
  imports: [NwIcon, TranslocoPipe],
  templateUrl: './appearance-modes.html',
  styleUrl: './appearance-modes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.appearance-panel--workspace]': "presentation() === 'grid'",
    '[class.appearance-panel--picker]': "presentation() === 'picker'",
  },
})
export class AppearanceModes {
  readonly presentation = input.required<'picker' | 'grid'>({ alias: 'adm-appearance-modes' });
  readonly modes = input.required<readonly AppearanceModeChoice[]>();
  readonly preference = input.required<ThemePreference>();
  /** The radio group's name. */
  readonly name = input.required<string>();
  readonly choose = output<ThemePreference>();
}
