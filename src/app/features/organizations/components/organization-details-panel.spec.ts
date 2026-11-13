import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { NEVER } from 'rxjs';
import en from '../../../../i18n/en.json';
import { ViewState } from '../../../core/state/view-state';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NW_DIALOG_TITLE_ID } from '../../../shared/ui/dialog/dialog.service';
import { OrganizationCommercial } from '../domain/organization-commercial.model';
import { NOW, PLATFORMS, commercialOf, detailOf } from '../testing/organizations-testing';
import {
  OrganizationDetailsPanel,
  OrganizationDetailsPanelData,
} from './organization-details-panel';

const text = (e: Element | null | undefined) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

function render(commercial: ViewState<OrganizationCommercial>) {
  const data: OrganizationDetailsPanelData = {
    activity: null,
    detail: () => detailOf(),
    platform: PLATFORMS[0]!,
    mayEdit: false,
    editAvailable: false,
    edit: () => undefined,
    showCommercial: true,
    canViewSubscriptions: true,
    commercial: () => commercial,
    retryCommercial: () => undefined,
  };
  TestBed.configureTestingModule({
    imports: [
      OrganizationDetailsPanel,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      { provide: DIALOG_DATA, useValue: data },
      // The NwDialog frame listens to these; nothing here closes or emits.
      {
        provide: DialogRef,
        useValue: { close: () => undefined, backdropClick: NEVER, keydownEvents: NEVER },
      },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: NW_DIALOG_TITLE_ID, useValue: 'organization-details-title' },
    ],
  });
  const fixture = TestBed.createComponent(OrganizationDetailsPanel);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  element.querySelector<HTMLButtonElement>('#organization-details-tab-payments')!.click();
  fixture.detectChanges();
  const section = () =>
    [...element.querySelectorAll('section')].find(
      (s) => text(s.querySelector('h3')) === en.organizations.detail.assistedPayments,
    ) ?? null;
  return { element, section };
}

describe('Organization details panel: assisted payments (WP-2.2)', () => {
  it('says eligibility is not verified and why, with no policy rows and no "Change policy"', () => {
    const { element, section } = render({ status: 'success', data: commercialOf() });
    const assisted = section()!;
    expect(text(assisted.querySelector('[data-eligibility]'))).toBe(
      en.organizations.eligibility.notVerified,
    );
    expect(text(assisted)).toContain(en.organizations.eligibility.notVerifiedDetail);
    expect(assisted.querySelectorAll('dl, button, [role="switch"], input')).toHaveLength(0);
    expect(text(assisted)).not.toMatch(/\b(enabled|disabled|inherits|override|eligible)\b/i);
    // The other commercial sections are still shown beside it.
    expect(text(element)).toContain(en.organizations.detail.assistedPayments);
  });

  it('keeps an unavailable section as unavailable', () => {
    const { section } = render({
      status: 'success',
      data: { ...commercialOf(), assistedPayments: { status: 'unavailable' } },
    });
    expect(text(section())).toContain(en.organizations.states.sectionUnavailable);
    expect(section()!.querySelector('[data-eligibility]')).toBeNull();
  });
});

describe('Organization details panel: subscription lifecycle (WP-4.1)', () => {
  const subscriptionSection = (element: HTMLElement) =>
    [...element.querySelectorAll('section')].find(
      (s) => text(s.querySelector('h3')) === en.organizations.detail.subscription,
    )!;
  const L = en.subscriptionLifecycle;

  it('shows the period, grace, a scheduled cancellation and a lagging stored status, as illustrative demo data', () => {
    const base = commercialOf();
    const { element } = render({
      status: 'success',
      data: {
        ...base,
        subscription: {
          status: 'available',
          data: {
            ...(base.subscription.status === 'available' ? base.subscription.data : ({} as never)),
            lifecycle: {
              state: 'active',
              storedStatus: 'grace',
              storedStatusLags: true,
              currentPeriodStart: '2026-01-01T00:00:00.000Z',
              currentPeriodEnd: '2026-11-01T00:00:00.000Z',
              graceUntil: '2026-11-02T00:00:00.000Z',
              cancelAtPeriodEnd: true,
              effectiveTerminationAt: null,
              accessEndsAt: '2026-11-02T00:00:00.000Z',
            },
          },
        },
      },
    });
    const section = subscriptionSection(element);
    expect(text(section.querySelector('[data-lifecycle]'))).toBe(L.state.active);
    expect(section.querySelector('[data-cancellation-scheduled]')).not.toBeNull();
    for (const row of [
      'period-start',
      'period-end',
      'grace-until',
      'cancellation',
      'stored-status',
    ])
      expect(section.querySelector(`[data-${row}]`), row).not.toBeNull();
    expect(section.querySelector('[data-termination]')).toBeNull();
    expect(text(section.querySelector('[data-cancellation] dd'))).toBe(
      L.condition.cancellationScheduledDetail,
    );
    expect(text(section.querySelector('[data-stored-status] code'))).toBe('grace');
    expect(text(section.querySelector('[data-stored-status-lags]'))).toBe(
      L.detail.storedStatusLags,
    );
    expect(text(section.querySelector('[data-subscription-illustrative]'))).toBe(
      L.detail.illustrative,
    );
    // Read only: nothing to renew, cancel or pay.
    expect(section.querySelectorAll('button, input, form')).toHaveLength(0);
  });

  it('tells "expired" and "access ended" apart from "no subscription"', () => {
    const base = commercialOf();
    const with_ = (state: 'expired' | 'terminated' | 'none') =>
      render({
        status: 'success',
        data: {
          ...base,
          subscription: {
            status: 'available',
            data: {
              state: 'none',
              lifecycle: {
                state,
                storedStatus: state === 'none' ? null : 'expired',
                storedStatusLags: false,
                currentPeriodStart: state === 'none' ? null : '2025-01-01T00:00:00.000Z',
                currentPeriodEnd: state === 'none' ? null : '2026-01-01T00:00:00.000Z',
                graceUntil: state === 'none' ? null : '2026-01-02T00:00:00.000Z',
                cancelAtPeriodEnd: false,
                effectiveTerminationAt: state === 'terminated' ? '2025-06-01T00:00:00.000Z' : null,
                accessEndsAt: null,
              },
            },
          },
        },
      }).element;
    for (const state of ['expired', 'terminated', 'none'] as const) {
      TestBed.resetTestingModule();
      const section = subscriptionSection(with_(state));
      expect(text(section.querySelector('[data-lifecycle]')), state).toBe(L.state[state]);
      expect(section.querySelector('[data-termination]') !== null, state).toBe(
        state === 'terminated',
      );
      expect(section.querySelector('[data-period-end]') !== null, state).toBe(state !== 'none');
    }
  });
});
