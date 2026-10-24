import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DemoWorldTables, OrganizationRecord } from '../../../demo/world/records';
import {
  SUBSCRIPTION_GRACE_HOURS,
  grantsOf,
  organizationsOf,
  organizationsOfCompany,
  platformCommercialOf,
  platformRefs,
  subscriptionDistribution,
  subscriptionEndOf,
  subscriptionStateOf,
} from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import { LicensesOverview, SubscriptionAttention } from '../domain/licenses.model';
import { LicensesGateway } from './licenses.gateway';

/** Which answer the mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type LicensesDemoScenario = 'normal' | 'empty' | 'error';

export const LICENSES_DEMO_SCENARIO = new InjectionToken<LicensesDemoScenario>(
  'LICENSES_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** "Ending soon": an active subscription that ends within this many days (as the Company Overview's card). */
export const LICENSES_ENDING_WITHIN_DAYS = 14;

const DAY_MS = 86_400_000;

/** Grace first (it ends sooner), then active subscriptions ending within the threshold; each by when it ends. */
function attentionOf(
  world: DemoWorldTables,
  organizations: readonly OrganizationRecord[],
  now: number,
): readonly SubscriptionAttention[] {
  const items: SubscriptionAttention[] = [];
  for (const o of organizations) {
    const subscription = subscriptionStateOf(world, o.id, now);
    const base = { organizationId: o.id, platformId: o.platformId, organizationName: o.name };
    if (subscription.state === 'grace' && subscription.graceEndsAt)
      items.push({ ...base, reason: 'graceEnds', at: subscription.graceEndsAt });
    else if (subscription.state === 'active') {
      const endsAt = subscriptionEndOf(world, o.id);
      if (endsAt !== null && Date.parse(endsAt) <= now + LICENSES_ENDING_WITHIN_DAYS * DAY_MS)
        items.push({ ...base, reason: 'ends', at: endsAt });
    }
  }
  return items.sort(
    (a, b) =>
      Number(b.reason === 'graceEnds') - Number(a.reason === 'graceEnds') ||
      a.at.localeCompare(b.at),
  );
}

/**
 * The overview of the demo world at `now`, every figure from the canonical selectors (`subscriptionDistribution`), so it
 * agrees with the Company Overview, the Platform dashboards and the Organization directory by construction. Personal
 * Premium is the Platform's declared count, independent of memberships and never added to subscriptions.
 */
export function demoLicensesOverview(world: DemoWorldTables, now: number): LicensesOverview {
  const distribution = (organizations: readonly OrganizationRecord[]) =>
    subscriptionDistribution(world, organizations, now, LICENSES_ENDING_WITHIN_DAYS);
  const organizations = organizationsOfCompany(world);
  return {
    endingWithinDays: LICENSES_ENDING_WITHIN_DAYS,
    graceHours: SUBSCRIPTION_GRACE_HOURS,
    company: distribution(organizations),
    platforms: platformRefs(world).map((platform) => {
      const premium = platformCommercialOf(world, platform.id)?.personalPremium;
      return {
        platform,
        distribution: distribution(organizationsOf(world, platform.id)),
        personalPremium:
          premium === undefined
            ? { status: 'unavailable' }
            : { status: 'available', value: premium },
      };
    }),
    attention: attentionOf(world, organizations, now),
  };
}

const NOT_FOUND: AppError = { kind: 'not_found', status: 404 };
/** Core's guard answer for an identity that is not the Company's owner. */
const FORBIDDEN: AppError = { kind: 'forbidden', code: 'forbidden', status: 403 };

/**
 * Mock adapter (demo builds only), reading the demo world at request time. The Company owner only: no session `401`,
 * anyone else `403` (an operator included, whatever their Platform assignments; a member never reaches it), another
 * Company the collapsed `404`. Read only: it changes nothing.
 */
export class MockLicensesGateway extends LicensesGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(LICENSES_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);

  overview(company: CompanyId): Observable<LicensesOverview> {
    return defer(() => {
      const world = this.world.snapshot();
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (grantsOf(world, signedIn.businessIdentityId).companyId !== world.company.id)
        return this.fail(FORBIDDEN);
      if (company !== world.company.id) return this.fail(NOT_FOUND);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const overview = demoLicensesOverview(
        this.scenario === 'empty' ? { ...world, organizations: [] } : world,
        this.now(),
      );
      return of(overview).pipe(delay(this.latency));
    });
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_LICENSES_PROVIDERS: readonly Provider[] = [
  { provide: LicensesGateway, useClass: MockLicensesGateway },
];
