import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { computed, signal } from '@angular/core';
import ar from '../../../i18n/ar.json';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import { AuthSession } from '../../core/auth/auth-session';
import { NotificationCenter as NotificationState } from '../../core/notifications/notification-center';
import { NotificationIndicator } from '../../core/notifications/notification-indicator';
import { NotificationCenter } from './notification-center';

@Component({ template: '' })
class Blank {}

describe('header notification center', () => {
  beforeEach(() => {
    const state = {
      state: signal({ status: 'success' as const, data: [] }),
      records: computed(() => []),
      unread: computed(() => 0),
      unavailable: computed(() => false),
      actionPending: signal(false),
      actionError: signal(false),
      markRead: () => undefined,
      keepUnread: () => undefined,
      markAllRead: () => undefined,
      reload: () => undefined,
    };
    TestBed.configureTestingModule({
      imports: [
        NotificationCenter,
        TranslocoTestingModule.forRoot({
          langs: { en, fr, ar },
          translocoConfig: {
            availableLangs: ['en', 'fr', 'ar'],
            defaultLang: 'en',
          },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([
          { path: '', component: Blank },
          { path: 'notifications', component: Blank },
        ]),
        { provide: NotificationState, useValue: state },
        { provide: NotificationIndicator, useValue: { unread: signal(0) } },
        { provide: AuthSession, useValue: { isDemo: signal(true) } },
      ],
    });
  });

  it('opens without navigating and restores focus when Escape closes the panel', async () => {
    const fixture = TestBed.createComponent(NotificationCenter);
    fixture.detectChanges();
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const trigger = fixture.nativeElement.querySelector(
      'button.top-bar__bell',
    ) as HTMLButtonElement;

    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    document
      .querySelector('[role="dialog"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});
