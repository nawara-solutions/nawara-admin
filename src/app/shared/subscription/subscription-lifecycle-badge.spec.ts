import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../i18n/ar.json';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import { SubscriptionLifecycleBadge } from './subscription-lifecycle-badge';
import {
  SUBSCRIPTION_LIFECYCLE_BADGES,
  SubscriptionLifecycle,
  SubscriptionLifecycleState,
} from './subscription-lifecycle';

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

const lifecycle = (
  state: SubscriptionLifecycleState,
  cancelAtPeriodEnd = false,
): SubscriptionLifecycle => ({
  state,
  storedStatus: null,
  storedStatusLags: false,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  graceUntil: null,
  cancelAtPeriodEnd,
  effectiveTerminationAt: null,
  accessEndsAt: null,
});

function render(lang: 'en' | 'fr' | 'ar', value: SubscriptionLifecycle) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [
      SubscriptionLifecycleBadge,
      TranslocoTestingModule.forRoot({
        langs: { en, fr, ar },
        translocoConfig: { availableLangs: ['en', 'fr', 'ar'], defaultLang: lang },
        preloadLangs: true,
      }),
    ],
  });
  const fixture = TestBed.createComponent(SubscriptionLifecycleBadge);
  fixture.componentRef.setInput('lifecycle', value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const STATES = Object.keys(SUBSCRIPTION_LIFECYCLE_BADGES) as SubscriptionLifecycleState[];

describe('SubscriptionLifecycleBadge (WP-4.1)', () => {
  it('labels every lifecycle state in English, French and Arabic, with no untranslated key', () => {
    for (const [lang, copy] of [
      ['en', en],
      ['fr', fr],
      ['ar', ar],
    ] as const)
      for (const state of STATES) {
        const element = render(lang, lifecycle(state));
        const badge = element.querySelector(`[data-lifecycle="${state}"]`);
        expect(text(badge), `${lang} ${state}`).toBe(copy.subscriptionLifecycle.state[state]);
        expect(text(element), lang).not.toMatch(/subscriptionLifecycle\./);
      }
  });

  it('adds "Cancellation scheduled" only while access continues', () => {
    for (const state of STATES) {
      const element = render('en', lifecycle(state, true));
      expect(element.querySelector('[data-cancellation-scheduled]') !== null, state).toBe(
        state === 'active' || state === 'grace',
      );
    }
    expect(
      render('en', lifecycle('active')).querySelector('[data-cancellation-scheduled]'),
    ).toBeNull();
    expect(
      text(render('fr', lifecycle('active', true)).querySelector('[data-cancellation-scheduled]')),
    ).toBe(fr.subscriptionLifecycle.condition.cancellationScheduled);
  });

  it('is presentation only: no button, link or input, and no payment or renewal wording', () => {
    for (const state of STATES) {
      const element = render('en', lifecycle(state, true));
      expect(element.querySelectorAll('button, a, input, form')).toHaveLength(0);
      expect(text(element)).not.toMatch(/paid|payment|renew|invoice/i);
    }
  });
});
