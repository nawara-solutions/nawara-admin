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
  it('rolls back the appearance pair if its second write fails and preserves unrelated preferences', () => {
    const store = TestBed.inject(PreferenceStore);
    store.write('theme', 'light');
    store.write('accent', 'sapphire');
    store.write('locale', 'fr');
    const original = Storage.prototype.setItem;
    let failed = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === PREFERENCE_KEYS.accent && !failed) {
        failed = true;
        throw new Error('quota');
      }
      original.call(this, key, value);
    });
    expect(store.commitAppearance({ theme: 'dark', accent: 'rose' })).toBe(false);
    expect(store.read('theme')).toBe('light');
    expect(store.read('accent')).toBe('sapphire');
    expect(store.read('locale')).toBe('fr');
  });
});
