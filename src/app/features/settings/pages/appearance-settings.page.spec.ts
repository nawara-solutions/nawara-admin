import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../i18n/en.json';
import { ACCENT_PALETTES, ThemeService } from '../../../core/theme/theme.service';
import { AppearanceSettingsPage } from './appearance-settings.page';

async function render() {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  TestBed.configureTestingModule({
    imports: [
      AppearanceSettingsPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { defaultLang: 'en', availableLangs: ['en'] },
        preloadLangs: true,
      }),
    ],
  });
  const fixture = TestBed.createComponent(AppearanceSettingsPage);
  await fixture.whenStable();
  return {
    fixture,
    host: fixture.nativeElement as HTMLElement,
    theme: TestBed.inject(ThemeService),
  };
}

describe('Appearance customization workspace', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['accent'];
    vi.unstubAllGlobals();
  });

  it('renders exactly the registry using semantic swatches and accessible native radio choices', async () => {
    const { host } = await render();
    const choices = Array.from(host.querySelectorAll<HTMLInputElement>('.accent-grid input'));
    expect(choices.map((choice) => choice.value)).toEqual([...ACCENT_PALETTES]);
    for (const choice of choices) {
      expect(choice.type).toBe('radio');
      expect(choice.closest('label')?.textContent?.trim()).not.toBe('');
      expect(
        choice.closest('label')?.querySelector<HTMLElement>('.accent-grid__swatch')?.style
          .backgroundColor,
      ).toBe(`var(--nw-swatch-${choice.value})`);
    }
    expect(host.querySelector('.accent-picker__trigger')).toBeNull();
    expect(
      Array.from(host.querySelectorAll('.appearance-panel__mode-description')).map((item) =>
        item.textContent?.trim(),
      ),
    ).toEqual([
      en.preferences.appearance.modeCard.system,
      en.preferences.appearance.modeCard.light,
      en.preferences.appearance.modeCard.dark,
    ]);
    expect(host.querySelectorAll('.appearance-panel__mode-check')).toHaveLength(1);
    expect(host.querySelector('.appearance-panel__status--dirty')).toBeNull();
  });

  it('previews all accents and modes without changing committed appearance, while keeping the preview inert', async () => {
    const { fixture, host, theme } = await render();
    const preview = host.querySelector('adm-appearance-preview');
    expect(preview?.querySelectorAll('a, button, input, select, iframe')).toHaveLength(0);
    expect(preview?.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain(
      'Illustrative',
    );
    expect(preview?.querySelector('nw-brand-mark')).not.toBeNull();
    for (const mode of ['light', 'dark'] as const) {
      host.querySelector<HTMLInputElement>(`input[name$="-mode"][value="${mode}"]`)?.click();
      for (const accent of ACCENT_PALETTES) {
        host.querySelector<HTMLInputElement>(`.accent-grid input[value="${accent}"]`)?.click();
        await fixture.whenStable();
        expect(theme.accent()).toBe('coral');
        expect(document.documentElement.dataset['accent'] ?? 'coral').toBe('coral');
        expect(host.querySelector('.appearance-panel__preview')?.getAttribute('data-accent')).toBe(
          accent,
        );
        expect(host.querySelector('.appearance-panel__preview')?.getAttribute('data-theme')).toBe(
          mode,
        );
        expect(host.querySelectorAll('.accent-grid input:checked')).toHaveLength(1);
        expect(host.querySelectorAll('.accent-grid__check')).toHaveLength(1);
        expect(
          host
            .querySelector('.appearance-panel__preview')
            ?.querySelector('.appearance-preview__chart svg'),
        ).not.toBeNull();
        expect(host.querySelectorAll('.appearance-panel__mode-check')).toHaveLength(1);
        expect(host.querySelector('adm-appearance-preview')).toBe(preview);
      }
    }
    for (const mode of ['light', 'dark', 'system'] as const) {
      host.querySelector<HTMLInputElement>(`input[name$="-mode"][value="${mode}"]`)?.click();
      await fixture.whenStable();
      expect(theme.preference()).toBe('system');
      expect(host.querySelector('adm-appearance-preview')).toBe(preview);
    }
    (host.querySelector('.appearance-panel__reset') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(theme.preference()).toBe('system');
    expect(theme.accent()).toBe('coral');
    expect(host.querySelector<HTMLInputElement>('.accent-grid input[value="coral"]')?.checked).toBe(
      true,
    );
    expect(host.querySelector<HTMLButtonElement>('.appearance-panel__reset')?.disabled).toBe(true);
  });
});
