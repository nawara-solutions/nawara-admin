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
});
