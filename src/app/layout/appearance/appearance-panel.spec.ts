import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import { ThemeService } from '../../core/theme/theme.service';
import { AppearanceDraft } from './appearance-draft';
import { AppearancePanel } from './appearance-panel';

function render() {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  TestBed.configureTestingModule({
    imports: [
      AppearancePanel,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
  });
  const fixture = TestBed.createComponent(AppearancePanel);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const modes = () =>
    Array.from(host.querySelectorAll<HTMLInputElement>('input[type=radio][name$="-mode"]'));
  const text = (selector: string) =>
    host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  return { fixture, host, modes, text, theme: TestBed.inject(ThemeService) };
}

describe('AppearancePanel', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['accent'];
    vi.unstubAllGlobals();
  });

  it('keeps Mode, Accent colour, Density, the browser-only note and reset in order', () => {
    const { host, modes, text } = render();
    expect(host.querySelector('.appearance-panel__mode-description')).toBeNull();
    expect(host.querySelector('.appearance-panel__mode-check')).toBeNull();
    const sections = Array.from(
      host.querySelectorAll(
        '.appearance-panel__legend, .appearance-panel__note, .appearance-panel__reset',
      ),
    ).map((element) => element.textContent?.replace(/\s+/g, ' ').trim());
    expect(sections).toEqual([
      en.preferences.appearance.mode,
      en.preferences.appearance.accent,
      en.preferences.appearance.density,
      en.preferences.appearance.localNote,
      en.preferences.appearance.resetShort,
    ]);
    expect(modes().map((r) => r.value)).toEqual(['system', 'light', 'dark']);
    // The checked radio is what assistive technology announces as selected.
    expect(modes().find((r) => r.checked)?.value).toBe('system');
    // Accent: one compact selector showing the current palette, never the whole list.
    expect(host.querySelectorAll('.accent-picker__trigger')).toHaveLength(1);
    expect(host.querySelectorAll('[role=option], input[name$="-accent"]')).toHaveLength(0);
    expect(text('.accent-picker__value')).toBe('Coral');
  });

  it('stages mode choices without a separate mode hint', async () => {
    const { fixture, host, modes, text, theme } = render();
    const fieldset = host.querySelector('fieldset');
    const hint = host.querySelector('.appearance-panel__hint');
    expect(fieldset?.getAttribute('aria-describedby')).toBeNull();
    expect(hint).toBeNull();

    modes()
      .find((r) => r.value === 'light')
      ?.click();
    await fixture.whenStable();
    expect(theme.preference()).toBe('system');
    expect(host.querySelector<HTMLButtonElement>('.appearance-panel__apply')?.disabled).toBe(false);
    expect(modes().find((radio) => radio.checked)?.value).toBe('light');
    expect(text('.appearance-panel__status')).toBe(en.preferences.appearance.localPending);

    modes()
      .find((r) => r.value === 'dark')
      ?.click();
    await fixture.whenStable();
    expect(modes().find((radio) => radio.checked)?.value).toBe('dark');
  });

  it('stages reset and persists the authoritative defaults only after Apply', async () => {
    const { fixture, host, modes, text, theme } = render();
    const reset = host.querySelector<HTMLButtonElement>('.appearance-panel__reset');
    expect(reset?.disabled).toBe(true);
    await theme.setAccent('amber');
    theme.setPreference('dark');
    await fixture.whenStable();
    expect(reset?.disabled).toBe(false);
    expect(text('.accent-picker__value')).toBe('Amber');

    reset?.click();
    await fixture.whenStable();
    expect(theme.accent()).toBe('amber');
    expect(theme.preference()).toBe('dark');
    expect(host.querySelector<HTMLButtonElement>('.appearance-panel__apply')?.disabled).toBe(false);
    (host.querySelector('.appearance-panel__apply') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(theme.accent()).toBe('coral');
    expect(theme.preference()).toBe('system');
    expect(modes().find((r) => r.checked)?.value).toBe('system');
    expect(text('.accent-picker__value')).toBe('Coral');
    expect(localStorage.getItem('nw.accent')).toBeNull();
    expect(localStorage.getItem('nw.theme')).toBeNull();
  });
  it('stages density, saves it on Apply, and restores default density on Reset', async () => {
    const { fixture, host, theme } = render();
    const options = () => [...host.querySelectorAll<HTMLInputElement>('input[name$="-density"]')];
    expect(options().map((option) => option.value)).toEqual(['1', '2', '3', '4', '5']);
    expect(options().find((option) => option.checked)?.value).toBe('3');
    options()[0]?.click();
    await fixture.whenStable();
    expect(theme.density()).toBe(3);
    expect(host.querySelector<HTMLButtonElement>('.appearance-panel__apply')?.disabled).toBe(false);
    host.querySelector<HTMLButtonElement>('.appearance-panel__apply')?.click();
    await fixture.whenStable();
    expect(theme.density()).toBe(1);
    host.querySelector<HTMLButtonElement>('.appearance-panel__reset')?.click();
    await fixture.whenStable();
    expect(options().find((option) => option.checked)?.value).toBe('3');
    expect(theme.density()).toBe(1);
    host.querySelector<HTMLButtonElement>('.appearance-panel__apply')?.click();
    await fixture.whenStable();
    expect(theme.density()).toBe(3);
  });

  it('synchronizes committed choices between editors without sharing their drafts', async () => {
    const first = render();
    const second = TestBed.createComponent(AppearancePanel);
    await first.fixture.whenStable();
    await second.whenStable();
    const a = first.fixture.debugElement.injector.get(AppearanceDraft);
    const b = second.debugElement.injector.get(AppearanceDraft);
    a.setAccent('emerald');
    a.setPreference('dark');
    expect(b.accent()).toBe('coral');
    expect(first.theme.accent()).toBe('coral');
    await a.apply();
    await second.whenStable();
    expect(b.accent()).toBe('emerald');
    expect(b.preference()).toBe('dark');
    expect(b.dirty()).toBe(false);
    second.destroy();
  });
});
