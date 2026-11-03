import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { computed, signal } from '@angular/core';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import fr from '../../../../i18n/fr.json';
import { AuthSession } from '../../../core/auth/auth-session';
import type { NotificationRecord } from '../../../core/notifications/notification-inbox.gateway';
import { NotificationCenter } from '../../../core/notifications/notification-center';
import { NotificationsPage } from './notifications.page';

@Component({ template: '' })
class Blank {}

const records: NotificationRecord[] = [
  {
    id: 'invitation-1',
    category: 'invitation',
    titleKey: 'notifications.records.invitation.title',
    descriptionKey: 'notifications.records.invitation.description',
    context: 'École Horizon · Nawara School',
    createdAt: '2026-11-03T12:00:00.000Z',
    priority: 'normal',
    unread: true,
    destination: '/platforms/school/organizations/horizon/members',
  },
  {
    id: 'license-1',
    category: 'license',
    titleKey: 'notifications.records.license.title',
    descriptionKey: 'notifications.records.license.description',
    context: 'Nawara School',
    createdAt: '2026-11-03T11:00:00.000Z',
    priority: 'urgent',
    unread: false,
    destination: '/licenses',
  },
];

describe('NotificationsPage', () => {
  beforeEach(() => {
    const state = signal({ status: 'success' as const, data: records });
    const actions = {
      state,
      records: computed(() => (state().status === 'success' ? state().data : [])),
      unread: computed(() => state().data.filter((record) => record.unread).length),
      unavailable: computed(() => false),
      actionPending: signal(false),
      actionError: signal(false),
      markRead: (id: string) => {
        state.update((current) => ({
          status: 'success',
          data: current.data.map((record) =>
            record.id === id ? { ...record, unread: false } : record,
          ),
        }));
      },
      keepUnread: () => undefined,
      markAllRead: () => {
        state.update((current) => ({
          status: 'success',
          data: current.data.map((record) => ({ ...record, unread: false })),
        }));
      },
      reload: () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [
        NotificationsPage,
        TranslocoTestingModule.forRoot({
          langs: { en, fr, ar },
          translocoConfig: { availableLangs: ['en', 'fr', 'ar'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: '**', component: Blank },
        ]),
        { provide: NotificationCenter, useValue: actions },
        { provide: AuthSession, useValue: { isDemo: signal(true) } },
      ],
    });
  });

  it('filters by category and marks an actionable notification read before navigating', async () => {
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.notifications__row')).toHaveLength(2);
    const category = [...fixture.nativeElement.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Invitations',
    ) as HTMLButtonElement;
    category.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.notifications__row')).toHaveLength(1);

    const title = fixture.nativeElement.querySelector(
      '.notifications__row-title[type="button"]',
    ) as HTMLButtonElement;
    title.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/platforms/school/organizations/horizon/members');
    expect(fixture.nativeElement.querySelector('.notifications__row--unread')).toBeNull();
  });

  it('communicates that the example inbox is demo data', async () => {
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.notifications__demo')?.textContent).toContain(
      en.notifications.demoOnly,
    );
  });
});
