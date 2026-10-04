import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

type Listener = (event: MediaQueryListEvent) => void;

function stubSystemTheme(dark: boolean) {
  const listeners: Listener[] = [];
  const query = {
    matches: dark,
    addEventListener: (_: string, listener: Listener) => listeners.push(listener),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => query),
  );
  return {
    change: (next: boolean) =>
      listeners.forEach((l) => l({ matches: next } as MediaQueryListEvent)),
  };
}

describe('ThemeService', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['accent'];
    vi.unstubAllGlobals();
  });

  it('defaults to system and follows the operating-system preference live', () => {
    const system = stubSystemTheme(true);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.preference()).toBe('system');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    system.change(false);
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('applies and persists an explicit preference', () => {
    stubSystemTheme(false);
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('nw.theme')).toBe('dark');
  });

  it('restores a stored preference and ignores invalid values', () => {
    stubSystemTheme(false);
    localStorage.setItem('nw.theme', 'neon');
    expect(TestBed.inject(ThemeService).preference()).toBe('system');
  });

  it('defaults to the coral accent, with no accent attribute', () => {
    stubSystemTheme(false);
    const service = TestBed.inject(ThemeService);
    TestBed.tick();
    expect(service.accent()).toBe('coral');
    expect(document.documentElement.dataset['accent']).toBeUndefined();
    expect(service.customized()).toBe(false);
  });

  it('applies and persists an accent palette, and stores nothing for the default', async () => {
    stubSystemTheme(false);
    const service = TestBed.inject(ThemeService);
    await service.setAccent('teal');
    TestBed.tick();
    expect(document.documentElement.dataset['accent']).toBe('teal');
    expect(localStorage.getItem('nw.accent')).toBe('teal');
    await service.setAccent('coral');
    TestBed.tick();
    expect(document.documentElement.dataset['accent']).toBeUndefined();
    expect(localStorage.getItem('nw.accent')).toBeNull();
  });

  it('restores a stored accent and ignores unknown or unsafe values', () => {
    stubSystemTheme(false);
    localStorage.setItem('nw.accent', 'indigo');
    expect(TestBed.inject(ThemeService).accent()).toBe('indigo');
    TestBed.resetTestingModule();
    localStorage.setItem('nw.accent', '"><script>');
    expect(TestBed.inject(ThemeService).accent()).toBe('coral');
  });

  it('resets mode and accent to the Nawara defaults and forgets them', async () => {
    stubSystemTheme(false);
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    await service.setAccent('amber');
    expect(service.customized()).toBe(true);
    service.reset();
    TestBed.tick();
    expect(service.preference()).toBe('system');
    expect(service.accent()).toBe('coral');
    expect(localStorage.getItem('nw.theme')).toBeNull();
    expect(localStorage.getItem('nw.accent')).toBeNull();
    expect(document.documentElement.dataset['accent']).toBeUndefined();
  });

  it('still applies preferences when browser storage is unavailable', async () => {
    stubSystemTheme(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const service = TestBed.inject(ThemeService);
    expect(service.accent()).toBe('coral');
    await service.setAccent('plum');
    TestBed.tick();
    expect(document.documentElement.dataset['accent']).toBe('plum');
    vi.restoreAllMocks();
  });

  it('waits for the palette artwork before switching, and the last choice wins', async () => {
    stubSystemTheme(false);
    const decodes: (() => void)[] = [];
    // jsdom has no image decoding: provide one that resolves only when the test says so.
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: () => new Promise<void>((resolve) => decodes.push(resolve)),
    });
    const service = TestBed.inject(ThemeService);
    const first = service.setAccent('teal');
    expect(service.accent()).toBe('coral'); // still the old palette while teal's artwork loads
    const second = service.setAccent('indigo');
    decodes.forEach((resolve) => resolve());
    await Promise.all([first, second]);
    expect(service.accent()).toBe('indigo');
    delete (HTMLImageElement.prototype as { decode?: unknown }).decode;
  });
});
