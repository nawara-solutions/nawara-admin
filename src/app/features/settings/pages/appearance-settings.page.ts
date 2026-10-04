import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AppearancePanel } from '../../../layout/appearance/appearance-panel';

/**
 * Settings → Appearance: the same Appearance panel as the popover of the top bar and the sign-in pages, bound to the
 * same state. Personal and browser-local; nothing here is a Company or Platform setting.
 */
@Component({
  selector: 'adm-appearance-settings-page',
  imports: [TranslocoPipe, AppearancePanel],
  template: `
    <header class="appearance-settings__header">
      <p class="appearance-settings__eyebrow">{{ 'settings.title' | transloco }}</p>
      <h1 class="appearance-settings__title">{{ 'settings.appearance.title' | transloco }}</h1>
      <p class="appearance-settings__subtitle">{{ 'settings.appearance.subtitle' | transloco }}</p>
    </header>
    <section class="appearance-settings__card" aria-labelledby="appearance-settings-heading">
      <h2 id="appearance-settings-heading" class="nw-visually-hidden">
        {{ 'settings.appearance.title' | transloco }}
      </h2>
      <adm-appearance-panel />
    </section>
  `,
  styles: `
    :host {
      display: grid;
      align-content: start;
      gap: var(--nw-space-5);
      max-inline-size: 40rem;
    }

    .appearance-settings__header {
      display: grid;
      gap: var(--nw-space-2);
    }

    .appearance-settings__eyebrow {
      color: var(--nw-text-brand);
      font-size: var(--nw-text-size-sm);
      font-weight: var(--nw-font-weight-semibold);
    }

    .appearance-settings__title {
      font-size: 1.625rem;
      font-weight: var(--nw-font-weight-bold);
      letter-spacing: -0.025em;
      line-height: 1.1;

      &:lang(ar) {
        letter-spacing: 0;
      }
    }

    .appearance-settings__subtitle {
      color: var(--nw-text-label);
      font-size: 0.90625rem;
    }

    .appearance-settings__card {
      padding: var(--nw-space-6);
      border: 1px solid var(--nw-border-subtle);
      border-radius: 1.125rem;
      background-color: var(--nw-surface-raised);
      box-shadow: var(--nw-shadow-card);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'appearance-settings' },
})
export class AppearanceSettingsPage {}
