import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../i18n/ar.json';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import { ACCENT_PALETTES, ThemeService } from '../../core/theme/theme.service';
import { ACCENT_KEYS, AccentPicker } from './accent-picker';

@Component({
  imports: [AccentPicker],
  template: `
    <span id="accent-label">Accent colour</span>
    <adm-accent-picker labelledBy="accent-label" />
    <button type="button" class="elsewhere">Elsewhere</button>
  `,
})
class Host {}

async function render(lang: 'en' | 'fr' | 'ar' = 'en') {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: { en, fr, ar },
        translocoConfig: { availableLangs: ['en', 'fr', 'ar'], defaultLang: lang },
        preloadLangs: true,
      }),
    ],
  });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  const overlay = TestBed.inject(OverlayContainer).getContainerElement();
  const trigger = host.querySelector<HTMLButtonElement>('.accent-picker__trigger')!;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  };
  const open = async () => {
    trigger.click();
    await settle();
  };
  const search = () => overlay.querySelector<HTMLInputElement>('.accent-picker__input');
  const options = () => Array.from(overlay.querySelectorAll<HTMLElement>('[role=option]'));
  const names = () =>
    options().map((o) => o.querySelector('.accent-picker__name')?.textContent?.trim());
  const type = async (value: string) => {
    const input = search()!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const key = async (key: string) => {
    search()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await settle();
  };
  return {
    fixture,
    host,
    overlay,
    trigger,
    settle,
    open,
    search,
    options,
    names,
    type,
    key,
    theme: TestBed.inject(ThemeService),
  };
}

describe('AccentPicker', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['accent'];
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('shows the current palette in one compact, labelled selector', async () => {
    const { host, trigger, options } = await render();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    // Named by the visible label plus the current value; described by "Choose an accent".
    const [label, value] = (trigger.getAttribute('aria-labelledby') ?? '').split(' ');
    expect(label).toBe('accent-label');
    expect(host.querySelector(`#${value}`)?.textContent?.trim()).toBe('Coral');
    const hint = host.querySelector(`#${trigger.getAttribute('aria-describedby')}`);
    expect(hint?.textContent?.trim()).toBe(en.preferences.appearance.chooseAccent);
    // The list is not rendered until opened.
    expect(options()).toHaveLength(0);
  });

  it('opens a searchable list of every registry palette, the current one selected, focus in the search', async () => {
    const { trigger, open, search, options, names } = await render();
    await open();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(names()).toEqual([
      'Coral',
      'Rose',
      'Plum',
      'Indigo',
      'Teal',
      'Amber',
      'Midnight',
      'Pearl',
      'Sapphire',
      'Emerald',
      'Burgundy',
    ]);
    expect(options()).toHaveLength(ACCENT_PALETTES.length);
    // Every registry palette has a name (the map is typed against the registry).
    expect(Object.keys(ACCENT_KEYS)).toEqual([...ACCENT_PALETTES]);
    const selected = options().filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected.map((o) => o.textContent?.trim())).toEqual(['Coral']);
    expect(document.activeElement).toBe(search());
    expect(search()?.getAttribute('role')).toBe('combobox');
    expect(search()?.getAttribute('aria-activedescendant')).toBe(options()[0]?.id);
    const listbox = document.getElementById(search()?.getAttribute('aria-controls') ?? '');
    expect(listbox?.getAttribute('role')).toBe('listbox');
  });

  it('filters by name, ignoring case and accents, and shows a clear no-results state', async () => {
    const { overlay, open, type, names } = await render();
    await open();
    await type('SA');
    expect(names()).toEqual(['Sapphire']);
    await type('e');
    expect(names()).toEqual(['Rose', 'Teal', 'Amber', 'Pearl', 'Sapphire', 'Emerald']);

    await type('zzz');
    expect(names()).toEqual([]);
    expect(overlay.querySelector('[role=listbox]')?.hasAttribute('hidden')).toBe(true);
    expect(overlay.querySelector('.accent-picker__empty')?.textContent?.trim()).toBe(
      'No accent matches “zzz”.',
    );
    expect(overlay.querySelector('[role=status]')?.textContent?.trim()).toBe('Matching accents: 0');

    await type('');
    expect(names()).toHaveLength(11);
  });

  it('chooses with the keyboard, applies and persists at once, keeps the mode, and returns focus', async () => {
    const { trigger, open, key, options, search, theme, settle } = await render();
    theme.setPreference('dark');
    await open();
    await key('ArrowDown'); // Rose
    await key('ArrowDown'); // Plum
    await key('ArrowUp'); // Rose
    expect(search()?.getAttribute('aria-activedescendant')).toBe(options()[1]?.id);
    await key('Enter');
    await settle();
    expect(theme.accent()).toBe('rose');
    expect(localStorage.getItem('nw.accent')).toBe('rose');
    expect(document.documentElement.dataset['accent']).toBe('rose');
    expect(theme.preference()).toBe('dark');
    expect(localStorage.getItem('nw.theme')).toBe('dark');
    expect(options()).toHaveLength(0);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    expect(trigger.textContent).toContain('Rose');
  });

  it('wraps around and jumps to the ends, and Enter on a filtered list picks the active match', async () => {
    const { open, key, type, options, search, theme, settle } = await render();
    await open();
    await key('ArrowUp'); // from Coral, wraps to Burgundy
    expect(search()?.getAttribute('aria-activedescendant')).toBe(options()[10]?.id);
    await key('PageUp');
    expect(search()?.getAttribute('aria-activedescendant')).toBe(options()[0]?.id);
    await key('PageDown');
    expect(search()?.getAttribute('aria-activedescendant')).toBe(options()[10]?.id);
    await type('tea');
    await key('Enter');
    await settle();
    expect(theme.accent()).toBe('teal');
  });

  it('chooses with a click', async () => {
    const { trigger, open, options, theme, settle } = await render();
    await open();
    const sapphire = options().find((o) => o.textContent?.includes('Sapphire'));
    sapphire?.click();
    await settle();
    // Applied once its artwork is ready (ThemeService.setAccent); stored at once.
    await vi.waitFor(() => expect(theme.accent()).toBe('sapphire'));
    expect(localStorage.getItem('nw.accent')).toBe('sapphire');
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Escape (the list only, the event goes no further) and on Tab, focus back on the selector', async () => {
    const { trigger, open, search, options, theme } = await render();
    await open();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);
    search()!.dispatchEvent(escape);
    await Promise.resolve();
    document.body.removeEventListener('keydown', outer);
    expect(outer).not.toHaveBeenCalled();
    expect(escape.defaultPrevented).toBe(true);
    expect(theme.accent()).toBe('coral');
    expect(document.activeElement).toBe(trigger);

    await open();
    expect(options()).toHaveLength(11);
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    search()!.dispatchEvent(tab);
    expect(document.activeElement).toBe(trigger);
    expect(theme.accent()).toBe('coral');
  });

  it('closes when the selector is pressed again, or on a click elsewhere, without choosing', async () => {
    const { host, trigger, open, options, settle, theme } = await render();
    await open();
    trigger.click();
    await settle();
    expect(options()).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);

    await open();
    const elsewhere = host.querySelector<HTMLButtonElement>('.elsewhere')!;
    elsewhere.focus();
    elsewhere.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    elsewhere.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(options()).toHaveLength(0);
    // Focus stays where the user clicked.
    expect(document.activeElement).toBe(elsewhere);
    expect(theme.accent()).toBe('coral');
  });

  it('names and searches the palettes in French (accents ignored) and Arabic', async () => {
    const french = await render('fr');
    expect(french.trigger.textContent).toContain('Corail');
    expect(french.trigger.textContent).toContain(fr.preferences.appearance.chooseAccent);
    await french.open();
    expect(french.search()?.placeholder).toBe(fr.preferences.appearance.searchAccents);
    await french.type('emer');
    expect(french.names()).toEqual(['Émeraude']);
    TestBed.resetTestingModule();
    document.body.innerHTML = '';

    const arabic = await render('ar');
    expect(arabic.trigger.textContent).toContain('مرجاني');
    await arabic.open();
    expect(arabic.names()).toHaveLength(11);
    await arabic.type('ياقوت');
    expect(arabic.names()).toEqual(['ياقوتي']);
    await arabic.type('emerald');
    // The machine value also matches, whatever the language.
    expect(arabic.names()).toEqual(['زمردي']);
  });
});
