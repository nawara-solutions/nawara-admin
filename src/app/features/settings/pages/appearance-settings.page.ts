import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppearancePanel } from '../../../layout/appearance/appearance-panel';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { AppearancePreview } from '../components/appearance-preview/appearance-preview';

/** Settings-only customization workspace; all preferences still belong to ThemeService. */
@Component({
  selector: 'adm-appearance-settings-page',
  imports: [TranslocoPipe, AppearancePanel, AppearancePreview, NwIcon],
  template: `
    <section class="appearance-settings__surface" aria-labelledby="appearance-settings-heading">
      <adm-appearance-panel accentPresentation="grid">
        <header class="appearance-settings__header" appearanceHeading>
          <nw-icon name="palette" size="lg" />
          <div>
            <h2 class="appearance-settings__title" id="appearance-settings-heading">
              {{ 'settings.appearance.title' | transloco }}
            </h2>
            <p>{{ 'settings.appearance.subtitle' | transloco }}</p>
          </div>
        </header>
        <adm-appearance-preview appearancePreview />
      </adm-appearance-panel>
    </section>
  `,
  styleUrl: './appearance-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearanceSettingsPage {}
