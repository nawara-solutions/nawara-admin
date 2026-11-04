import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ACCENT_PALETTES, ThemeService } from '../../core/theme/theme.service';
import { NwIcon } from '../../shared/ui/icon/icon';
import { ACCENT_KEYS } from './accent-picker';

let nextId = 0;
/** Settings-only presentation of the existing registry and preference state. */
@Component({
  selector: 'adm-accent-grid',
  imports: [TranslocoPipe, NwIcon],
  template: `
    <fieldset class="accent-grid" [attr.aria-labelledby]="labelledBy()">
      @for (accent of accents; track accent.value) {
        <label class="accent-grid__tile">
          <input
            type="radio"
            [name]="id"
            [value]="accent.value"
            [checked]="theme.accent() === accent.value"
            (change)="theme.setAccent(accent.value)"
          />
          <span
            class="accent-grid__swatch"
            [style.background-color]="accent.swatch"
            aria-hidden="true"
          ></span>
          <span>{{ accent.key | transloco }}</span>
          @if (theme.accent() === accent.value) {
            <nw-icon class="accent-grid__check" name="circle-check" size="sm" />
          }
        </label>
      }
    </fieldset>
  `,
  styleUrl: './accent-grid.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccentGrid {
  readonly labelledBy = input.required<string>();
  protected readonly theme = inject(ThemeService);
  protected readonly id = 'accent-grid-' + nextId++;
  protected readonly accents = ACCENT_PALETTES.map((value) => ({
    value,
    key: ACCENT_KEYS[value],
    swatch: `var(--nw-swatch-${value})`,
  }));
}
