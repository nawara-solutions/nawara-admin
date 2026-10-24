import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthGateway, UnavailableAuthGateway } from '../../../core/auth/auth.gateway';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { SignOut } from '../../../core/auth/sign-out';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { EntityLabel } from '../../../core/context/entity-label';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import { NotificationIndicator } from '../../../core/notifications/notification-indicator';
import {
  NotificationSummary,
  NotificationSummaryGateway,
  UnavailableNotificationSummaryGateway,
} from '../../../core/notifications/notification-summary.gateway';
import { MockNotificationSummaryGateway } from '../../../core/notifications/notification-summary.mock';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { Sidebar } from '../../../layout/sidebar/sidebar';
import { TopBar } from '../../../layout/top-bar/top-bar';
import { NotificationsFacade } from '../application/notifications.facade';
import { NotificationsPage } from './notifications.page';

const t = en.notifications;

@Component({ template: '' })
class Blank {}

/** The shell's three readers of the count, side by side: the bell, the sidebar and the page. */
@Component({
  imports: [TopBar, Sidebar, NotificationsPage],
  template: '<adm-top-bar /><adm-sidebar /><adm-notifications-page />',
})
class Host {}

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.multi,
  email: 'p@x.invalid',
  platformAssignments: [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID],
};

/** A count gateway as a script, for the error state. */
class Failing extends NotificationSummaryGateway {
  static answer: () => Observable<NotificationSummary> = () =>
    throwError((): AppError => ({ kind: 'unavailable', status: 503 }));
  summary(): Observable<NotificationSummary> {
    return Failing.answer();
  }
}

async function render(
  actor: Actor = owner,
  { gateway = 'mock' }: { gateway?: 'mock' | 'unavailable' | 'failing' } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      Host,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'notifications', component: Blank },
        { path: 'settings', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      {
        provide: NotificationSummaryGateway,
        useClass:
          gateway === 'mock'
            ? MockNotificationSummaryGateway
            : gateway === 'failing'
              ? Failing
              : UnavailableNotificationSummaryGateway,
      },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      { provide: AuthGateway, useClass: UnavailableAuthGateway },
      NotificationIndicator,
      NotificationsFacade,
      ScopeContext,
      EntityLabel,
      SignOut,
    ],
  });
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  TestBed.inject(AuthSession).establish(actor);
  const spy = vi.spyOn(TestBed.inject(NotificationSummaryGateway), 'summary');
  await TestBed.inject(Router).navigateByUrl('/notifications');
  const fixture = TestBed.createComponent(Host);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  await settle();
  await settle();
  const page = element.querySelector('adm-notifications-page') as HTMLElement;
  return { element, page, spy, settle, indicator: TestBed.inject(NotificationIndicator) };
}

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Personal Notifications (P8-S3)', { timeout: 15_000 }, () => {
  it('shows the owner their own 4 unread, the same count as the sidebar badge and the bell', async () => {
    const { element, page, indicator } = await render(owner);
    expect(text(page.querySelector('h1'))).toBe(t.header.title);
    expect(text(page.querySelector('[data-unread] h2'))).toBe(t.count.label);
    expect(text(page.querySelector('.notifications__value'))).toBe('4');
    expect(text(page.querySelector('[data-unread] .notifications__muted'))).toBe(t.count.note);
    expect(indicator.unread()).toBe(4);
    expect(text(element.querySelector('a[href="/notifications"] .sidebar__badge'))).toBe('4');
    const bell = element.querySelector('a.top-bar__bell');
    expect(bell?.getAttribute('href')).toBe('/notifications');
    expect(bell?.getAttribute('aria-label')).toBe('Notifications, 4 unread');
    expect(bell?.querySelector('.top-bar__dot')).not.toBeNull();
    expect(bell?.getAttribute('aria-current')).toBe('page');
  });

  it('shows an operator their own 0, never the owner’s, and does not call zero "no notifications"', async () => {
    const { element, page, indicator } = await render(operator);
    expect(text(page.querySelector('.notifications__value'))).toBe('0');
    expect(text(page.querySelector('[data-unread] .notifications__muted'))).toBe(t.count.zero);
    expect(indicator.unread()).toBe(0);
    // The personal entry beside Settings, with no badge, and a bell with no dot.
    expect(element.querySelector('.sidebar__footer a[href="/notifications"]')).not.toBeNull();
    expect(element.querySelector('.sidebar__badge')).toBeNull();
    const bell = element.querySelector('a.top-bar__bell');
    expect(bell?.getAttribute('aria-label')).toBe(en.shell.notifications.bell);
    expect(bell?.querySelector('.top-bar__dot')).toBeNull();
    // No Operations destination is exposed to the operator.
    expect(text(element.querySelector('adm-sidebar'))).not.toContain(
      en.shell.nav.groups.operations,
    );
  });

  it('answers only for the signed-in session: the gateway takes no identity', async () => {
    const { spy } = await render(operator);
    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) expect(call).toEqual([]);
    expect(MockNotificationSummaryGateway.prototype.summary.length).toBe(0);
    TestBed.resetTestingModule();
    // Whoever the session belongs to decides the count, not the page.
    const other = await render({ ...operator, userId: DEMO_OPERATOR_IDS.school });
    expect(text(other.page.querySelector('.notifications__value'))).toBe('0');
  });

  it('shows no message, sender, time, code or action of any kind', async () => {
    const { page } = await render(owner);
    expect(page.querySelectorAll('button, a, input, form, [role="dialog"], time')).toHaveLength(0);
    expect([...page.querySelectorAll('[data-inbox] li')].map((li) => text(li))).toEqual([
      t.inbox.contents,
      t.inbox.actions,
      t.inbox.codes,
    ]);
    expect(text(page)).not.toMatch(/\b\d{6}\b|123456|042917/);
  });

  it('makes no network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const openSpy = vi.spyOn(XMLHttpRequest.prototype, 'open');
    await render(owner);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('says the inbox read is not available in a build without the mock, with no badge or dot', async () => {
    const { element, page } = await render(owner, { gateway: 'unavailable' });
    expect(text(page.querySelector('nw-data-state'))).toContain(t.states.notInBuildTitle);
    expect(page.querySelector('.notifications__value')).toBeNull();
    expect(element.querySelector('.sidebar__badge')).toBeNull();
    expect(element.querySelector('.top-bar__dot')).toBeNull();
    expect(element.querySelector('a.top-bar__bell')?.getAttribute('aria-label')).toBe(
      en.shell.notifications.bell,
    );
  });

  it('offers a retry after an error, and the retry asks again', async () => {
    Failing.answer = () => throwError((): AppError => ({ kind: 'unavailable', status: 503 }));
    const { page, spy, settle } = await render(owner, { gateway: 'failing' });
    expect(text(page.querySelector('nw-data-state'))).toContain(t.states.errorTitle);
    Failing.answer = () => of({ unread: 4 });
    page.querySelector<HTMLButtonElement>('nw-data-state button')?.click();
    await settle();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(text(page.querySelector('.notifications__value'))).toBe('4');
  });
});
