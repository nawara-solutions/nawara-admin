import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppearancePanel } from '../../../layout/appearance/appearance-panel';
import { AppearancePreview } from '../components/appearance-preview/appearance-preview';

/** Settings-only customization workspace; all preferences still belong to ThemeService. */
@Component({
  selector: 'adm-appearance-settings-page',
  imports: [TranslocoPipe, AppearancePanel, AppearancePreview],
  template: `
    <section class="appearance-settings__surface" aria-labelledby="appearance-settings-heading">
      <h2 class="nw-visually-hidden" id="appearance-settings-heading">
        {{ 'settings.appearance.title' | transloco }}
      </h2>
      <adm-appearance-panel accentPresentation="grid">
        <adm-appearance-preview appearancePreview />
      </adm-appearance-panel>
    </section>
  `,
  styleUrl: './appearance-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearanceSettingsPage {}
