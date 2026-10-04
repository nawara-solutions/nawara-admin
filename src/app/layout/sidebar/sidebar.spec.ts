import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import { Actor } from '../../core/auth/actor';
import { AuthSession } from '../../core/auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../core/context/scope-directory.mock';
import { companyId, platformId } from '../../core/context/scope.model';
import { NotificationIndicator } from '../../core/notifications/notification-indicator';
import {
  NotificationSummaryGateway,
  UnavailableNotificationSummaryGateway,
} from '../../core/notifications/notification-summary.gateway';
import { MockNotificationSummaryGateway } from '../../core/notifications/notification-summary.mock';
import { Sidebar } from './sidebar';

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
  platformAssignments: [platformId('school')],
};
const DEMO: DemoBindings = {
  signIn: { accounts: [], password: 'p', code: 'c' },
  providers: {
    auth: [],
    scopeDirectory: [],
    notificationSummary: [],
    platformDirectory: [],
    companyOverview: [],
    commercialSummary: [],
    serviceHealth: [],
  },
};

async function render(actor: Actor, notifications: 'demo' | 'unavailable' = 'demo') {
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
          notifications === 'demo'
            ? MockNotificationSummaryGateway
            : UnavailableNotificationSummaryGateway,
      },
      NotificationIndicator,
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const fixture = TestBed.createComponent(Sidebar);
  await fixture.whenStable();
  // Let the zero-latency notification mock (`delay(0)`) answer.
  await new Promise((resolve) => setTimeout(resolve, 5));
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('Sidebar', () => {
  it('links only the built pages; the other approved destinations are not links', async () => {
    const sidebar = await render(owner);
    const links = Array.from(sidebar.querySelectorAll('nav a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/overview']);
    expect(sidebar.querySelector('.sidebar__footer a')?.getAttribute('href')).toBe('/settings');
    const inert = sidebar.querySelectorAll('.sidebar__item--unavailable');
    expect(inert.length).toBe(11);
    expect(Array.from(inert).every((item) => item.tagName === 'SPAN')).toBe(true);
    expect(inert[0]?.textContent).toContain(en.shell.notAvailableYet);
  });

  it('shows the owner profile with their role', async () => {
    const sidebar = await render(owner);
    expect(sidebar.querySelector('.sidebar__name')?.textContent).toBe('Demo Owner');
    expect(sidebar.querySelector('.sidebar__role')?.textContent).toBe(en.shell.role.owner);
  });

  it('hides the company-wide Overview from an operator and falls back to their email', async () => {
    const sidebar = await render(operator);
    expect(sidebar.querySelector('nav a')).toBeNull();
    // Personal settings (Appearance) are open to operators too: they grant no administrative capability.
    expect(sidebar.querySelector('.sidebar__footer a')?.getAttribute('href')).toBe('/settings');
    expect(sidebar.querySelector('.sidebar__name')?.textContent).toBe('operator@x.invalid');
  });

  it('renders the wordmark with the bloom artwork (coral + ink theme)', async () => {
    const sidebar = await render(owner);
    const mark = sidebar.querySelector('nw-brand-mark');
    const sources = Array.from(mark?.querySelectorAll('img') ?? []).map((i) =>
      i.getAttribute('src'),
    );
    expect(sources).toEqual(['brand/nawara-bloom-coral.svg', 'brand/nawara-bloom-glow.svg']);
    expect(mark?.querySelector('.nw-brand-mark__word')).not.toBeNull();
  });

  it('badges Notifications with the unread count, and shows no badge without a count', async () => {
    const withCount = await render(owner);
    expect(withCount.querySelector('.sidebar__badge')?.textContent?.trim()).toBe('4');
    TestBed.resetTestingModule();
    const without = await render(owner, 'unavailable');
    expect(without.querySelector('.sidebar__badge')).toBeNull();
  });

  it('shows the profile card disabled, as the account menu is not built', async () => {
    const sidebar = await render(owner);
    const profile = sidebar.querySelector<HTMLButtonElement>('.sidebar__profile');
    expect(profile?.disabled).toBe(true);
    expect(profile?.title).toBe(en.shell.notAvailableYet);
  });
});
