import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId, PlatformId, PlatformRef } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DemoWorldTables, OrganizationRecord } from '../../../demo/world/records';
import {
  SUBSCRIPTION_GRACE_HOURS,
  entitlementOf,
  grantsOf,
  isCompanyPlatform,
  organizationsOf,
  organizationsOfCompany,
  platformCommercialOf,
  platformRefOf,
  platformRefs,
  subscriptionDistribution,
  subscriptionEndOf,
  subscriptionEndsWithin,
  subscriptionStateOf,
} from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  LicensesOverview,
  OrganizationSubscriptionEntry,
  PlatformSubscriptions,
  SubscriptionAttention,
} from '../domain/licenses.model';
import { LicensesGateway } from './licenses.gateway';

/** Which answer the mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type LicensesDemoScenario = 'normal' | 'empty' | 'error';

export const LICENSES_DEMO_SCENARIO = new InjectionToken<LicensesDemoScenario>(
  'LICENSES_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** "Ending soon": an active subscription that ends within this many days (as the Company Overview's card). */
export const LICENSES_ENDING_WITHIN_DAYS = 14;

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
    else if (subscriptionEndsWithin(world, o.id, now, LICENSES_ENDING_WITHIN_DAYS)) {
      const endsAt = subscriptionEndOf(world, o.id);
      if (endsAt !== null) items.push({ ...base, reason: 'ends', at: endsAt });
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

/**
 * One Platform's Organizations with their subscriptions at `now`, from the same selectors as the overview: the entries'
 * states, ending-soon flags and entitlements add up to `distribution` by construction. An Organization without a
 * subscription record (one just created included) is listed as `none`, never given an invented subscription.
 */
export function demoPlatformSubscriptions(
  world: DemoWorldTables,
  platform: PlatformRef,
  now: number,
): PlatformSubscriptions {
  const organizations = organizationsOf(world, platform.id);
  return {
    platform,
    endingWithinDays: LICENSES_ENDING_WITHIN_DAYS,
    graceHours: SUBSCRIPTION_GRACE_HOURS,
    distribution: subscriptionDistribution(world, organizations, now, LICENSES_ENDING_WITHIN_DAYS),
    organizations: organizations.map((o): OrganizationSubscriptionEntry => {
      const { state, graceEndsAt } = subscriptionStateOf(world, o.id, now);
      return {
        organizationId: o.id,
        organizationName: o.name,
        state,
        endsAt: state === 'none' ? null : subscriptionEndOf(world, o.id),
        graceEndsAt: graceEndsAt ?? null,
        endingSoon: subscriptionEndsWithin(world, o.id, now, LICENSES_ENDING_WITHIN_DAYS),
        entitlement: entitlementOf(world, o.id, now),
      };
    }),
  };
}

const NOT_FOUND: AppError = { kind: 'not_found', status: 404 };
/** Core's guard answer for an identity that is not the Company's owner. */
const FORBIDDEN: AppError = { kind: 'forbidden', code: 'forbidden', status: 403 };

/**
 * Mock adapter (demo builds only), reading the demo world at request time. The Company owner only: no session `401`,
 * anyone else `403` (an operator included, whatever their Platform assignments; a member never reaches it), another
 * Company, or a Platform that is not the Company's, the collapsed `404`. Read only: it changes nothing.
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
      const refused = this.refusal(world, company);
      if (refused) return this.fail(refused);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const overview = demoLicensesOverview(
        this.scenario === 'empty' ? { ...world, organizations: [] } : world,
        this.now(),
      );
      return of(overview).pipe(delay(this.latency));
    });
  }

  platform(company: CompanyId, platform: PlatformId): Observable<PlatformSubscriptions> {
    return defer(() => {
      const world = this.world.snapshot();
      const refused = this.refusal(world, company);
      if (refused) return this.fail(refused);
      const ref = isCompanyPlatform(world, platform) ? platformRefOf(world, platform) : undefined;
      if (ref === undefined) return this.fail(NOT_FOUND);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const subscriptions = demoPlatformSubscriptions(
        this.scenario === 'empty' ? { ...world, organizations: [] } : world,
        ref,
        this.now(),
      );
      return of(subscriptions).pipe(delay(this.latency));
    });
  }

  /** Core's answer before any data: no session, not the Company's owner, or another Company. */
  private refusal(world: DemoWorldTables, company: CompanyId): AppError | null {
    const signedIn = this.auth.signedIn();
    if (signedIn === null) return { kind: 'unauthenticated', status: 401 };
    if (grantsOf(world, signedIn.businessIdentityId).companyId !== world.company.id)
      return FORBIDDEN;
    return company === world.company.id ? null : NOT_FOUND;
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_LICENSES_PROVIDERS: readonly Provider[] = [
  { provide: LicensesGateway, useClass: MockLicensesGateway },
];
