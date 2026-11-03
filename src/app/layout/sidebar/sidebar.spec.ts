import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER, Observable, of, throwError } from 'rxjs';
import ar from '../../../i18n/ar.json';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import { Actor } from '../../core/auth/actor';
import { AuthGateway, UnavailableAuthGateway } from '../../core/auth/auth.gateway';
import { AuthSession } from '../../core/auth/auth-session';
import { DemoAuthState } from '../../core/auth/auth.mock-state';
import { SignOut } from '../../core/auth/sign-out';
import { APP_ENVIRONMENT, DemoBindings } from '../../core/config/app-environment';
import { ScopeContext } from '../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../core/context/scope-directory.gateway';
import { DEMO_LATENCY_MS } from '../../core/context/scope-directory.mock';
import {
  CompanyDirectory,
  PlatformId,
  PlatformRef,
  companyId,
  platformId,
} from '../../core/context/scope.model';
import { NotificationIndicator } from '../../core/notifications/notification-indicator';
import {
  NotificationSummaryGateway,
  UnavailableNotificationSummaryGateway,
} from '../../core/notifications/notification-summary.gateway';
import { MockNotificationSummaryGateway } from '../../core/notifications/notification-summary.mock';
import { DemoNotificationInbox } from '../../core/notifications/notification-inbox.mock';
import { loadShellRoutes } from '../shell.routes';
import { NAVIGATION, NOTIFICATIONS_ITEM, SETTINGS_ITEM } from './navigation';
import { Sidebar } from './sidebar';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../demo/world/seed';

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'owner@x.invalid',
  displayName: 'Demo Owner',
  companyId: companyId('c'),
};
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'operator@x.invalid',
  platformAssignments: [platformId('school'), platformId('drive')],
};
const SCHOOL: PlatformRef = {
  id: platformId('school'),
  name: 'Nawara School',
  key: null,
  product: 'school',
};
const DRIVE: PlatformRef = {
  id: platformId('drive'),
  name: 'Nawara Drive',
  key: null,
  product: 'drive',
};
const DEMO: DemoBindings = {
  signIn: {
    accounts: [],
    password: 'p',
    code: 'c',
    operators: [],
    workingCode: 'w',
    newOperators: [],
    confirmationCode: 'k',
  },
  providers: {
    auth: [],
    scopeDirectory: [],
    notificationSummary: [],
    platformDirectory: [],
    companyOverview: [],
    commercialSummary: [],
    licenses: [],
    billing: [],
    activity: [],
    services: [],
    releases: [],
    companySettings: [],
    accountSecurity: [],
    platformDashboard: [],
    platformCommercial: [],
    organizations: [],
    organizationCommercial: [],
    platformCommands: [],
    organizationCommands: [],
    adminInvitations: [],
    memberships: [],
    operators: [],
    stepUp: [],
    assistance: [],
    financialAuthorization: [],
  },
};

/** The scope directory as a script: what `assignedPlatforms` answers. */
class ScriptedDirectory extends ScopeDirectoryGateway {
  static assigned: Observable<readonly PlatformRef[]> = of([SCHOOL, DRIVE]);
  companyDirectory(): Observable<CompanyDirectory> {
    return of({ company: { id: companyId('c'), name: 'Company' }, platforms: [SCHOOL, DRIVE] });
  }
  assignedPlatforms(ids: readonly PlatformId[]): Observable<readonly PlatformRef[]> {
    void ids;
    return ScriptedDirectory.assigned;
  }
}

@Component({ template: '' })
class Blank {}

async function render(
  actor: Actor,
  options: {
    notifications?: 'demo' | 'unavailable';
    assigned?: Observable<readonly PlatformRef[]>;
    /** The address to be at (active-route highlighting). */
    url?: string;
    lang?: 'en' | 'fr' | 'ar';
  } = {},
) {
  ScriptedDirectory.assigned = options.assigned ?? of([SCHOOL, DRIVE]);
  TestBed.configureTestingModule({
    imports: [
      Sidebar,
      TranslocoTestingModule.forRoot({
        langs: { en, fr, ar },
        translocoConfig: {
          availableLangs: ['en', 'fr', 'ar'],
          defaultLang: options.lang ?? 'en',
        },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([{ path: '**', component: Blank }]),
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      {
        provide: NotificationSummaryGateway,
        useClass:
          (options.notifications ?? 'demo') === 'demo'
            ? MockNotificationSummaryGateway
            : UnavailableNotificationSummaryGateway,
      },
      DemoNotificationInbox,
      { provide: ScopeDirectoryGateway, useClass: ScriptedDirectory },
      { provide: AuthGateway, useClass: UnavailableAuthGateway },
      NotificationIndicator,
      ScopeContext,
      SignOut,
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
    ],
  });
  // The simulated Core session the notification mock answers for.
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: {
      userId: actor.userId,
      email: actor.email,
      phone: null,
      adminTier: actor.kind,
    },
    // The demo world's business identity: its unread count is the world's record.
    businessIdentityId: actor.kind === 'owner' ? DEMO_OWNER_ID : DEMO_OPERATOR_IDS.school,
  });
  TestBed.inject(AuthSession).establish(actor);
  if (options.url) await TestBed.inject(Router).navigateByUrl(options.url);
  const fixture = TestBed.createComponent(Sidebar);
  await settle(fixture);
  return { sidebar: fixture.nativeElement as HTMLElement, fixture };
}

async function settle(fixture: { whenStable: () => Promise<unknown> }) {
  await fixture.whenStable();
  // Let the zero-latency mocks (`delay(0)`) answer.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await fixture.whenStable();
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Sidebar', () => {
  it('lists only working pages: every entry is a link, none is inert (G0-P0-3)', async () => {
    const { sidebar } = await render(owner);
    const links = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('nav a'));
    expect(
      links.map((a) => [a.getAttribute('href'), text(a.querySelector('.sidebar__label'))]),
    ).toEqual([
      ['/overview', en.shell.nav.overview],
      ['/platforms', en.shell.nav.platforms],
      ['/operators', en.shell.nav.operators],
      ['/licenses', en.shell.nav.licenses],
      ['/billing', en.shell.nav.billing],
      ['/releases', en.shell.nav.releases],
      ['/audit', en.shell.nav.audit],
      ['/notifications', en.shell.nav.notifications],
      ['/services', en.shell.nav.services],
    ]);
    expect(sidebar.querySelector('.sidebar__footer a')?.getAttribute('href')).toBe('/settings');
    // No inert, "not available yet" entry: Users & identity, Files and Monitoring are not listed until they exist (G0-D5).
    expect(
      sidebar.querySelectorAll('.sidebar__item--unavailable, nav span.sidebar__item'),
    ).toHaveLength(0);
    expect(sidebar.textContent).not.toContain(en.shell.notAvailableYet);
    for (const gone of ['Users & identity', 'Files', 'Monitoring'])
      expect(text(sidebar.querySelector('nav'))).not.toContain(gone);
  });

  it('every entry is a route the shell registers (no link to a destination that does not exist)', async () => {
    const [shell] = await loadShellRoutes({ production: true, demo: null });
    const registered = new Set((shell?.children ?? []).map((r) => `/${r.path}`));
    const entries = [...NAVIGATION.flatMap((g) => g.items), NOTIFICATIONS_ITEM, SETTINGS_ITEM];
    for (const item of entries)
      expect([item.labelKey, registered.has(item.path)]).toEqual([item.labelKey, true]);
  });

  it('highlights the current page, Platform-scoped Organization pages included', async () => {
    const active = (sidebar: HTMLElement) =>
      Array.from(sidebar.querySelectorAll('nav a[aria-current="page"]')).map((a) =>
        a.getAttribute('href'),
      );
    for (const [url, expected] of [
      ['/overview', ['/overview']],
      ['/platforms', ['/platforms']],
      ['/platforms/school', ['/platforms']],
      ['/platforms/school/organizations', ['/platforms']],
      ['/platforms/school/organizations/org-1/members', ['/platforms']],
      ['/billing/assistance', ['/billing']],
      ['/settings/security', []],
    ] as const) {
      const { sidebar } = await render(owner, { url });
      expect([url, active(sidebar)]).toEqual([url, expected]);
      TestBed.resetTestingModule();
    }
  });

  it('names its entries in French and Arabic from the catalogs', async () => {
    for (const [lang, catalog] of [
      ['fr', fr],
      ['ar', ar],
    ] as const) {
      const { sidebar } = await render(owner, { lang });
      const labels = Array.from(sidebar.querySelectorAll('nav a .sidebar__label')).map(text);
      expect(labels.slice(0, 3)).toEqual([
        catalog.shell.nav.overview,
        catalog.shell.nav.platforms,
        catalog.shell.nav.operators,
      ]);
      TestBed.resetTestingModule();
    }
  });

  it('shows the owner profile with their role', async () => {
    const { sidebar } = await render(owner);
    expect(sidebar.querySelector('.sidebar__name')?.textContent).toBe('Demo Owner');
    expect(sidebar.querySelector('.sidebar__role')?.textContent).toBe(en.shell.role.owner);
  });

  it('renders the Nawara Admin logo alone, named "Nawara Admin", without a SOLUTIONS line', async () => {
    const { sidebar } = await render(owner);
    const mark = sidebar.querySelector('nw-admin-brand-lockup');
    expect(mark?.getAttribute('aria-label')).toBe(en.brand.adminLogoLabel);
    expect(en.brand.adminLogoLabel).toBe('Nawara Admin');
    expect(mark?.querySelector('.admin-brand-lockup__nawara')?.textContent).toBe('Nawara');
    expect(mark?.querySelector('.admin-brand-lockup__admin')?.textContent).toBe('Admin');
  });

  it('badges Notifications with the owner’s unread count, and shows no badge without a count', async () => {
    const { sidebar: withCount } = await render(owner);
    expect(withCount.querySelector('.sidebar__badge')?.textContent?.trim()).toBe('4');
    // The badge sits on the working Notifications link (P8-S3).
    expect(
      withCount.querySelector('a[href="/notifications"] .sidebar__badge')?.textContent?.trim(),
    ).toBe('4');
    TestBed.resetTestingModule();
    const { sidebar: without } = await render(owner, { notifications: 'unavailable' });
    expect(without.querySelector('.sidebar__badge')).toBeNull();
  });

  describe('operator navigation (A3-S3)', () => {
    it('hides every company-wide destination and lists the assigned Platforms as links', async () => {
      const { sidebar } = await render(operator);
      // The Platforms directory is the owner's (company scope): an operator gets "Your platforms" instead.
      expect(sidebar.textContent).not.toContain(en.shell.nav.platforms);
      expect(sidebar.querySelector('nav a[href="/platforms"]')).toBeNull();
      // No Operations group (P8): its destinations are the owner's.
      expect(sidebar.textContent).not.toContain(en.shell.nav.groups.operations);
      expect(sidebar.textContent).not.toContain(en.shell.nav.audit);
      expect(sidebar.textContent).not.toContain(en.shell.nav.services);
      // The Company's operators are the owner's: an operator has no link to them (P6-S1).
      expect(sidebar.textContent).not.toContain(en.shell.nav.operators);
      // No Commercial destination either (P7-S1): commercial authority is the owner's, never an assignment's.
      expect(sidebar.textContent).not.toContain(en.shell.nav.licenses);
      expect(sidebar.textContent).not.toContain(en.shell.nav.billing);
      expect(sidebar.textContent).not.toContain(en.shell.nav.groups.commercial);
      expect(text(sidebar.querySelector('#sidebar-group-assigned'))).toBe(
        en.shell.context.assigned,
      );
      const links = Array.from(sidebar.querySelectorAll<HTMLAnchorElement>('nav a'));
      expect(links.map((a) => [a.getAttribute('href'), text(a)])).toEqual([
        ['/platforms/school', 'Nawara School'],
        ['/platforms/drive', 'Nawara Drive'],
      ]);
      // Personal Notifications (P8-S3) and settings are open to operators too: they grant no capability.
      expect(
        [...sidebar.querySelectorAll('.sidebar__footer a')].map((a) => a.getAttribute('href')),
      ).toEqual(['/notifications', '/settings']);
      expect(sidebar.querySelector('.sidebar__name')?.textContent).toBe('operator@x.invalid');
      expect(sidebar.querySelector('.sidebar__role')?.textContent).toBe(en.shell.role.operator);
    });

    it('shows a loading placeholder while the Platforms load', async () => {
      const { sidebar } = await render(operator, { assigned: NEVER });
      expect(sidebar.querySelector('.sidebar__loading nw-skeleton')).not.toBeNull();
      expect(text(sidebar.querySelector('.sidebar__loading [class="nw-visually-hidden"]'))).toBe(
        en.shell.nav.platformsLoading,
      );
      expect(sidebar.querySelector('nav a')).toBeNull();
    });

    it('says the Platforms are unavailable when they cannot be listed, offering no retry', async () => {
      const { sidebar } = await render(operator, {
        assigned: throwError(() => ({ kind: 'unavailable', status: 503 })),
      });
      expect(text(sidebar.querySelector('.sidebar__note'))).toBe(en.shell.nav.platformsUnavailable);
      expect(sidebar.querySelector('nav button')).toBeNull();
    });

    it('shows no group at all when the operator has no Platform to list', async () => {
      const { sidebar } = await render(operator, { assigned: of([]) });
      expect(sidebar.querySelector('#sidebar-group-assigned')).toBeNull();
      expect(sidebar.querySelector('nav a')).toBeNull();
    });

    it('never badges an operator with the owner’s notifications', async () => {
      const { sidebar } = await render(operator);
      expect(sidebar.querySelector('.sidebar__badge')).toBeNull();
    });
  });

  describe('account menu trigger (A3-S3)', () => {
    it('is a working menu button named by the person and their role', async () => {
      const { sidebar } = await render(owner);
      const card = sidebar.querySelector<HTMLButtonElement>('.sidebar__profile');
      expect(card?.disabled).toBe(false);
      expect(card?.getAttribute('aria-haspopup')).toBe('menu');
      expect(card?.getAttribute('aria-label')).toBe('Account: Demo Owner, Company owner');
      expect(card?.getAttribute('aria-busy')).toBeNull();
    });

    it('says it is signing out, busy and unavailable, while a sign-out runs', async () => {
      const { sidebar, fixture } = await render(owner);
      const gateway = TestBed.inject(AuthGateway);
      gateway.logout = () => NEVER;
      void TestBed.inject(SignOut).run();
      await settle(fixture);
      const card = sidebar.querySelector<HTMLButtonElement>('.sidebar__profile');
      expect(card?.getAttribute('aria-busy')).toBe('true');
      expect(card?.getAttribute('aria-disabled')).toBe('true');
      expect(sidebar.querySelector('.sidebar__role')?.textContent).toBe(
        en.shell.account.signingOut,
      );
      expect(sidebar.querySelector('.sidebar__profile nw-spinner')).not.toBeNull();
    });
  });
});
