import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DemoWorld } from '../../demo/world/demo-world';
import { DEMO_COMPANY_ID, DEMO_OWNER_ID } from '../../demo/world/seed';
import { Actor } from '../auth/actor';
import { AuthSession } from '../auth/auth-session';
import { APP_ENVIRONMENT } from '../config/app-environment';
import { platformId } from '../context/scope.model';
import { ThemeService } from '../theme/theme.service';
import { AccordionPreferences } from './accordion-preferences';
import {
  PREFERENCE_CONTRACTS,
  PREFERENCE_KEYS,
  PreferenceName,
  PreferenceStore,
} from './preference-store';

const REGISTERED = new Set<string>(Object.values(PREFERENCE_KEYS));
const X33: readonly PreferenceName[] = [
  'operatorTotalsMode',
  'operatorTotalsOpen',
  'licensesOverviewMode',
  'licensesOverviewOpen',
  'platformFiguresVisible',
  'platformSubscriptionsVisible',
];

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: 'operator-1',
  email: 'operator@x.invalid',
  platformAssignments: [platformId('school')],
};

/** Only the registered keys and the demo session's own keys are ever removed: never other storage. */
const clean = () => {
  REGISTERED.forEach((key) => localStorage.removeItem(key));
  ['nw.demo.actor', 'nw.demo.mockSession'].forEach((key) => sessionStorage.removeItem(key));
};
const storageKeys = (storage: Storage) =>
  Array.from({ length: storage.length }, (_, i) => storage.key(i)!);

function setUp() {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      // A demo build whose bindings are never loaded: a session can be established, nothing else runs.
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
    ],
  });
}

/** A page reload: a new injector reads what the browser kept. */
function reload() {
  TestBed.resetTestingModule();
  setUp();
}

describe('Preference contracts (WP-3.3)', () => {
  beforeEach(() => {
    clean();
    setUp();
  });
  afterEach(() => {
    clean();
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['accent'];
    vi.unstubAllGlobals();
  });

  it('closes the registry: every key has one contract, one storage key, and the browser as its owner', () => {
    expect(Object.keys(PREFERENCE_CONTRACTS).sort()).toEqual(Object.keys(PREFERENCE_KEYS).sort());
    expect(REGISTERED.size).toBe(Object.keys(PREFERENCE_KEYS).length);
    for (const [name, contract] of Object.entries(PREFERENCE_CONTRACTS))
      expect(contract.scope, name).toBe('browser');
    // No storage key is per actor, Platform or Organization.
    for (const key of REGISTERED)
      expect(key).not.toMatch(/[0-9a-f]{8}-|actor|platform-|organization/i);
  });

  it('keeps the approval boundary explicit: only theme, locale and accent are evidenced as approved', () => {
    const approved = Object.entries(PREFERENCE_CONTRACTS)
      .filter(([, c]) => c.approval === 'approved')
      .map(([name]) => name);
    expect(approved.sort()).toEqual(['accent', 'locale', 'theme']);
    const x33 = Object.entries(PREFERENCE_CONTRACTS)
      .filter(([, c]) => 'finding' in c && c.finding === 'X33')
      .map(([name]) => name);
    expect(x33.sort()).toEqual([...X33].sort());
    expect(PREFERENCE_CONTRACTS.density.approval).toBe('notEvidenced');
  });

  it('an approved preference is the browser’s: it survives a reload and every actor change, and is never in session storage', () => {
    const session = TestBed.inject(AuthSession);
    session.establish(owner);
    TestBed.inject(ThemeService).setPreference('dark');
    session.establish(operator);
    session.signOut();
    reload();
    expect(TestBed.inject(ThemeService).preference()).toBe('dark');
    TestBed.inject(AuthSession).establish(operator);
    expect(TestBed.inject(ThemeService).preference()).toBe('dark');
    // The only session keys are the demo session's own (PR #89, out of scope); no preference is among them.
    for (const key of storageKeys(sessionStorage)) expect(REGISTERED.has(key)).toBe(false);
  });

  it('falls back to the defaults on a missing or unknown stored value', () => {
    expect(TestBed.inject(ThemeService).preference()).toBe('system');
    expect(TestBed.inject(ThemeService).accent()).toBe('coral');
    expect(TestBed.inject(ThemeService).density()).toBe(3);
    localStorage.setItem(PREFERENCE_KEYS.theme, 'neon');
    localStorage.setItem(PREFERENCE_KEYS.accent, 'not-a-palette');
    localStorage.setItem(PREFERENCE_KEYS.density, '9');
    reload();
    const theme = TestBed.inject(ThemeService);
    expect([theme.preference(), theme.accent(), theme.density()]).toEqual(['system', 'coral', 3]);
  });

  it('writes only registered keys, and nothing to the demo world', () => {
    const world = TestBed.inject(DemoWorld);
    const before = world.snapshot();
    const theme = TestBed.inject(ThemeService);
    theme.setPreference('light');
    const store = TestBed.inject(PreferenceStore);
    store.write('locale', 'fr');
    const page = TestBed.inject(AccordionPreferences);
    page.setOperatorTotalsMode('hidden');
    page.setPlatformFiguresVisible(false);
    page.toggleLicensesOverview();
    for (const key of storageKeys(localStorage))
      if (key.startsWith('nw.') || key.startsWith('nawara.'))
        expect(REGISTERED.has(key), key).toBe(true);
    // Subscription, Billing, Payment and every other business fact: the very same snapshot.
    expect(world.snapshot()).toBe(before);
  });

  it('leaves the X33 page-section preferences exactly as they behave today', () => {
    const page = TestBed.inject(AccordionPreferences);
    // Defaults with nothing stored.
    expect([
      page.operatorTotalsMode(),
      page.licensesOverviewMode(),
      page.operatorTotalsOpen(),
      page.licensesOverviewOpen(),
      page.platformFiguresVisible(),
      page.platformSubscriptionsVisible(),
    ]).toEqual(['accordion', 'accordion', true, true, true, true]);
    page.setOperatorTotalsMode('visible');
    page.setPlatformSubscriptionsVisible(false);
    page.toggleOperatorTotals();
    expect(localStorage.getItem(PREFERENCE_KEYS.operatorTotalsMode)).toBe('visible');
    expect(localStorage.getItem(PREFERENCE_KEYS.platformSubscriptionsVisible)).toBe('false');
    expect(localStorage.getItem(PREFERENCE_KEYS.operatorTotalsOpen)).toBe('false');
    // An unknown stored mode reads as the default.
    localStorage.setItem(PREFERENCE_KEYS.licensesOverviewMode, 'sideways');
    reload();
    const again = TestBed.inject(AccordionPreferences);
    expect(again.licensesOverviewMode()).toBe('accordion');
    expect(again.operatorTotalsMode()).toBe('visible');
  });
});
