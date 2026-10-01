import { TestBed } from '@angular/core/testing';
import { PREFERENCE_KEYS, PreferenceStore } from './preference-store';

describe('PreferenceStore', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads and writes under the registered key', () => {
    const store = TestBed.inject(PreferenceStore);
    store.write('theme', 'dark');
    expect(localStorage.getItem(PREFERENCE_KEYS.theme)).toBe('dark');
    expect(store.read('theme')).toBe('dark');
  });

  it('falls back to null when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(TestBed.inject(PreferenceStore).read('locale')).toBeNull();
  });

  it('ignores write failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => TestBed.inject(PreferenceStore).write('locale', 'fr')).not.toThrow();
  });
});
