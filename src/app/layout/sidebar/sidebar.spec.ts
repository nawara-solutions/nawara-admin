import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER, Observable, of, throwError } from 'rxjs';
import en from '../../../i18n/en.json';
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
    serviceHealth: [],
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

async function render(
  actor: Actor,
  options: {
    notifications?: 'demo' | 'unavailable';
    assigned?: Observable<readonly PlatformRef[]>;
  } = {},
) {
  ScriptedDirectory.assigned = options.assigned ?? of([SCHOOL, DRIVE]);
  TestBed.configureTestingModule({
    imports: [
      Sidebar,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      {
        provide: NotificationSummaryGateway,
        useClass:
          (options.notifications ?? 'demo') === 'demo'
            ? MockNotificationSummaryGateway
            : UnavailableNotificationSummaryGateway,
      },
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
  it('links only the built pages; the other approved destinations are not links', async () => {
    const { sidebar } = await render(owner);
    const links = Array.from(sidebar.querySelectorAll('nav a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/overview',
      '/operators',
      '/licenses',
      '/billing',
    ]);
    expect(sidebar.querySelector('.sidebar__footer a')?.getAttribute('href')).toBe('/settings');
    const inert = sidebar.querySelectorAll('.sidebar__item--unavailable');
    expect(inert.length).toBe(8);
    expect(Array.from(inert).every((item) => item.tagName === 'SPAN')).toBe(true);
    expect(inert[0]?.textContent).toContain(en.shell.notAvailableYet);
  });

  it('shows the owner profile with their role', async () => {
    const { sidebar } = await render(owner);
    expect(sidebar.querySelector('.sidebar__name')?.textContent).toBe('Demo Owner');
    expect(sidebar.querySelector('.sidebar__role')?.textContent).toBe(en.shell.role.owner);
  });

  it('renders the wordmark with the palette-coloured bloom and SOLUTIONS on the same line', async () => {
    const { sidebar } = await render(owner);
    const mark = sidebar.querySelector('nw-brand-mark');
    expect(mark?.querySelector('svg.nw-brand-mark__bloom')).not.toBeNull();
    expect(mark?.querySelector('.nw-brand-mark__word')).not.toBeNull();
    expect(mark?.querySelector('.nw-brand-mark__solutions-text')?.textContent).toBe('SOLUTIONS');
    expect(mark?.querySelector('.nw-brand-mark__separator')).not.toBeNull();
    expect(mark?.querySelector('svg.nw-brand-mark__flourish')).toBeNull();
  });

  it('badges Notifications with the owner’s unread count, and shows no badge without a count', async () => {
    const { sidebar: withCount } = await render(owner);
    expect(withCount.querySelector('.sidebar__badge')?.textContent?.trim()).toBe('4');
    TestBed.resetTestingModule();
    const { sidebar: without } = await render(owner, { notifications: 'unavailable' });
    expect(without.querySelector('.sidebar__badge')).toBeNull();
  });

  describe('operator navigation (A3-S3)', () => {
    it('hides every company-wide destination and lists the assigned Platforms as links', async () => {
      const { sidebar } = await render(operator);
      expect(sidebar.querySelectorAll('.sidebar__item--unavailable').length).toBe(0);
      expect(sidebar.textContent).not.toContain(en.shell.nav.organizations);
      expect(sidebar.textContent).not.toContain(en.shell.nav.notifications);
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
      // Personal settings are open to operators too: they grant no administrative capability.
      expect(sidebar.querySelector('.sidebar__footer a')?.getAttribute('href')).toBe('/settings');
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
