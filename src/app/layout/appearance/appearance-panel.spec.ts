import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import { ThemeService } from '../../core/theme/theme.service';
import { AppearancePanel } from './appearance-panel';

function render() {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
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
  const radios = (group: string) =>
    Array.from(host.querySelectorAll<HTMLInputElement>(`input[type=radio][name$="-${group}"]`));
  return { fixture, host, radios, theme: TestBed.inject(ThemeService) };
}

describe('AppearancePanel', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['accent'];
    vi.unstubAllGlobals();
  });

  it('offers the three modes and the six named palettes as native radio groups', () => {
    const { host, radios } = render();
    const legends = Array.from(host.querySelectorAll('fieldset legend')).map((l) =>
      l.textContent?.trim(),
    );
    expect(legends).toEqual([en.preferences.appearance.mode, en.preferences.appearance.accent]);
    expect(radios('mode').map((r) => r.value)).toEqual(['system', 'light', 'dark']);
    expect(radios('accent').map((r) => r.closest('label')?.textContent?.trim())).toEqual([
      'Coral',
      'Rose',
      'Plum',
      'Indigo',
      'Teal',
      'Amber',
    ]);
    // The checked radio is what assistive technology announces as selected.
    expect(radios('mode').find((r) => r.checked)?.value).toBe('system');
    expect(radios('accent').find((r) => r.checked)?.value).toBe('coral');
  });

  it('applies a choice at once and reflects it', async () => {
    const { fixture, radios, theme } = render();
    const teal = radios('accent').find((r) => r.value === 'teal');
    teal?.click();
    await fixture.whenStable();
    expect(theme.accent()).toBe('teal');
    expect(teal?.checked).toBe(true);
    radios('mode')
      .find((r) => r.value === 'dark')
      ?.click();
    expect(theme.preference()).toBe('dark');
  });

  it('enables reset only after a change, and resets to the Nawara defaults', async () => {
    const { fixture, host, radios, theme } = render();
    const reset = host.querySelector<HTMLButtonElement>('.appearance-panel__reset');
    expect(reset?.disabled).toBe(true);
    radios('accent')
      .find((r) => r.value === 'amber')
      ?.click();
    await fixture.whenStable();
    expect(reset?.disabled).toBe(false);
    reset?.click();
    await fixture.whenStable();
    expect(theme.accent()).toBe('coral');
    expect(radios('accent').find((r) => r.checked)?.value).toBe('coral');
    expect(host.textContent).toContain(en.preferences.appearance.note);
  });
});
