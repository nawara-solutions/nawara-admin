import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import { ThemeService } from '../../core/theme/theme.service';
import { PREFERENCE_KEYS } from '../../core/preferences/preference-store';
import { NwToastService } from '../../shared/ui/toast/toast.service';
import { AppearanceDraft } from './appearance-draft';

function setup() {
  const listeners: ((event: MediaQueryListEvent) => void)[] = [];
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.push(listener),
    removeEventListener: () => undefined,
  }));
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { defaultLang: 'en', availableLangs: ['en'] },
        preloadLangs: true,
      }),
    ],
    providers: [AppearanceDraft],
  });
  const theme = TestBed.inject(ThemeService);
  const draft = TestBed.inject(AppearanceDraft);
  TestBed.tick();
  return { theme, draft, listeners };
}

describe('AppearanceDraft', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('does not persist or recolor the application while editing, and commits the pair only on Apply', async () => {
    const { theme, draft } = setup();
    expect(draft.dirty()).toBe(false);
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    draft.setPreference('dark');
    draft.setAccent('rose');
    TestBed.tick();
    expect(theme.preference()).toBe('system');
    expect(theme.accent()).toBe('coral');
    expect(draft.resolved()).toBe('dark');
    expect(draft.dirty()).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    await draft.apply();
    TestBed.tick();
    expect(theme.preference()).toBe('dark');
    expect(theme.accent()).toBe('rose');
    expect(draft.dirty()).toBe(false);
    expect(localStorage.getItem(PREFERENCE_KEYS.theme)).toBe('dark');
    expect(localStorage.getItem(PREFERENCE_KEYS.accent)).toBe('rose');
    writes.mockClear();
    await draft.apply();
    expect(writes).not.toHaveBeenCalled();
    draft.reset();
    TestBed.tick();
    expect(draft.preference()).toBe('system');
    expect(draft.accent()).toBe('coral');
    expect(theme.accent()).toBe('rose');
    expect(localStorage.getItem(PREFERENCE_KEYS.accent)).toBe('rose');
    await draft.apply();
    TestBed.tick();
    expect(draft.dirty()).toBe(false);
    expect(localStorage.getItem(PREFERENCE_KEYS.theme)).toBeNull();
    expect(localStorage.getItem(PREFERENCE_KEYS.accent)).toBeNull();
  });
  it('resolves staged System against the same live OS signal, even when the application is explicitly light', () => {
    const { theme, draft, listeners } = setup();
    theme.setPreference('light');
    TestBed.tick();
    draft.setPreference('system');
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
    TestBed.tick();
    expect(draft.resolved()).toBe('dark');
    expect(theme.resolved()).toBe('light');
    expect(draft.preference()).toBe('system');
  });
  it('retains draft and committed values and reports failure when storage is blocked', async () => {
    const { theme, draft } = setup();
    draft.setPreference('dark');
    draft.setAccent('emerald');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await draft.apply();
    TestBed.tick();
    expect(theme.preference()).toBe('system');
    expect(theme.accent()).toBe('coral');
    expect(draft.accent()).toBe('emerald');
    expect(draft.dirty()).toBe(true);
    expect(draft.applying()).toBe(false);
    expect(TestBed.inject(NwToastService).toasts()[0]?.tone).toBe('danger');
  });
});
