import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DemoWorldTables } from '../../../demo/world/records';
import {
  entitlementOf,
  grantsOf,
  organizationsOfCompany,
  paymentIssuesOf,
  platformRefOf,
  subscriptionStateOf,
} from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { PaymentFollowUp, PaymentFollowUps } from '../domain/billing.model';
import { BillingGateway } from './billing.gateway';

/** Which answer the mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type BillingDemoScenario = 'normal' | 'empty' | 'error';

export const BILLING_DEMO_SCENARIO = new InjectionToken<BillingDemoScenario>(
  'BILLING_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/**
 * The Company's payment follow-ups at `now`: exactly the world's payment-issue records of the Company's Organizations
 * (`paymentIssuesOf`, as the Company Overview counts them), each joined with its Organization, Platform, subscription
 * state and entitlement. Nothing is derived from a subscription: grace, an ending or a missing subscription makes no
 * follow-up, and a follow-up changes no state.
 */
export function demoPaymentFollowUps(world: DemoWorldTables, now: number): PaymentFollowUps {
  const organizations = organizationsOfCompany(world);
  const followUps = paymentIssuesOf(world, organizations).flatMap((issue): PaymentFollowUp[] => {
    const organization = organizations.find((o) => o.id === issue.organizationId);
    const platform = organization && platformRefOf(world, organization.platformId);
    if (!organization || !platform) return [];
    return [
      {
        organizationId: organization.id,
        organizationName: organization.name,
        platform,
        kind: issue.kind,
        subscription: subscriptionStateOf(world, organization.id, now).state,
        entitlement: entitlementOf(world, organization.id, now),
      },
    ];
  });
  return {
    followUps: followUps.sort(
      (a, b) =>
        Number(b.kind === 'failed') - Number(a.kind === 'failed') ||
        a.organizationName.localeCompare(b.organizationName),
    ),
  };
}

const NOT_FOUND: AppError = { kind: 'not_found', status: 404 };
/** Core's guard answer for an identity that is not the Company's owner. */
const FORBIDDEN: AppError = { kind: 'forbidden', code: 'forbidden', status: 403 };

/**
 * Mock adapter (demo builds only), reading the demo world at request time. The Company owner only: no session `401`,
 * anyone else `403` (an operator included, whatever their Platform assignments), another Company the collapsed `404`.
 * Read only: it changes nothing.
 */
export class MockBillingGateway extends BillingGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(BILLING_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);

  followUps(company: CompanyId): Observable<PaymentFollowUps> {
    return defer(() => {
      const world = this.world.snapshot();
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (grantsOf(world, signedIn.businessIdentityId).companyId !== world.company.id)
        return this.fail(FORBIDDEN);
      if (company !== world.company.id) return this.fail(NOT_FOUND);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const answer = demoPaymentFollowUps(
        this.scenario === 'empty' ? { ...world, paymentIssues: [] } : world,
        this.now(),
      );
      return of(answer).pipe(delay(this.latency));
    });
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_BILLING_PROVIDERS: readonly Provider[] = [
  { provide: BillingGateway, useClass: MockBillingGateway },
];
