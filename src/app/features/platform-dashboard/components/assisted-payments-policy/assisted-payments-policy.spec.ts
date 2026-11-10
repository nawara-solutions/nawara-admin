import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../../i18n/en.json';
import { AssistedPaymentsPolicyCard } from './assisted-payments-policy';

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('AssistedPaymentsPolicyCard (WP-2.2)', () => {
  it('states that eligibility is not verified, and offers no switch or other control', () => {
    TestBed.configureTestingModule({
      imports: [
        AssistedPaymentsPolicyCard,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
    });
    const fixture = TestBed.createComponent(AssistedPaymentsPolicyCard);
    fixture.componentRef.setInput('policy', { status: 'notVerified' });
    fixture.detectChanges();
    const card = fixture.nativeElement as HTMLElement;
    const P = en.platformDashboard.policies;
    expect(text(card.querySelector('h3'))).toBe(P.assistedPayments);
    expect(text(card.querySelector('[data-eligibility]'))).toBe(P.notVerified);
    expect(text(card)).toContain(P.notVerifiedDetail);
    expect(card.querySelectorAll('button, [role="switch"], input, [aria-checked]')).toHaveLength(0);
    expect(text(card)).not.toMatch(/\b(enabled|disabled|inherit|eligible)\b/i);
  });
});
