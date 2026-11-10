import { organizationId } from '../../core/context/scope.model';
import { createOperator } from './commands/operator.commands';
import { createPlatform } from './commands/platform.commands';
import { DemoWorldTables, OrganizationSubscriptionRecord } from './records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from './seed';
import {
  SUBSCRIPTION_GRACE_HOURS,
  entitlementOf,
  organizationsOf,
  subscriptionDistribution,
  entitlementWindowOf,
  subscriptionEndOf,
  subscriptionEndsWithin,
  subscriptionFactOf,
  subscriptionStateOf,
} from './selectors';

/**
 * WP-3.1: the subscription facts (Core's row fields, nawara-core `f62b96b`, identical at `8d89bed`) and the pure
 * entitlement derivation ported from billing-service `src/domain/entitlement.ts`. Pending, expired, cancelling and
 * terminated subscriptions are exercised through ISOLATED fixtures only: the demo seed's population is unchanged.
 */

const HOUR = 3_600_000;
const NOW = Date.parse('2026-10-23T12:00:00Z');
const seed = demoWorldSeed(NOW);

const ORG = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3cff');
const START = Date.parse('2026-01-01T00:00:00Z');
const END = Date.parse('2026-02-01T00:00:00Z');
const GRACE = END + 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

/** An established period `[START, END)` with its fixed grace; `over` adjusts one lifecycle fact. */
const fact = (
  over: Partial<OrganizationSubscriptionRecord> = {},
): OrganizationSubscriptionRecord => ({
  organizationId: ORG,
  status: 'active',
  currentPeriodStart: iso(START),
  currentPeriodEnd: iso(END),
  graceUntil: iso(GRACE),
  cancelAtPeriodEnd: false,
  effectiveTerminationAt: null,
  ...over,
});

const PENDING: OrganizationSubscriptionRecord = {
  organizationId: ORG,
  status: 'pending',
  currentPeriodStart: null,
  currentPeriodEnd: null,
  graceUntil: null,
  cancelAtPeriodEnd: false,
  effectiveTerminationAt: null,
};

/** The seed with exactly this one subscription fact. */
const worldWith = (record: OrganizationSubscriptionRecord): DemoWorldTables => ({
  ...seed,
  subscriptions: [record],
});

describe('subscription facts: the seed keeps Core’s invariants', () => {
  it('holds at most one record per Organization, only for known Organizations', () => {
    const ids = seed.subscriptions.map((s) => s.organizationId);
    expect(new Set(ids).size).toBe(ids.length);
    const known = new Set(seed.organizations.map((o) => o.id));
    expect(ids.every((id) => known.has(id))).toBe(true);
  });

  it('keeps the same Organizations without a record (no population change)', () => {
    const withRecord = new Set(seed.subscriptions.map((s) => s.organizationId));
    expect(
      seed.organizations
        .filter((o) => !withRecord.has(o.id))
        .map((o) => o.name)
        .sort(),
    ).toEqual(['Auto-École du Port', 'Institut Nour', 'École Bab Al Bahr']);
  });

  it('gives every seeded record an established period, its fixed grace, no cancellation and no termination', () => {
    for (const s of seed.subscriptions) {
      expect(s.status === 'active' || s.status === 'grace').toBe(true);
      const start = Date.parse(s.currentPeriodStart!);
      const end = Date.parse(s.currentPeriodEnd!);
      expect(start).toBeLessThan(end);
      // Illustrative starts never postdate the seed's clock, so every projection is unchanged.
      expect(start).toBeLessThanOrEqual(NOW);
      expect(Date.parse(s.graceUntil!) - end).toBe(SUBSCRIPTION_GRACE_HOURS * HOUR);
      expect(s.cancelAtPeriodEnd).toBe(false);
      expect(s.effectiveTerminationAt).toBeNull();
    }
  });

  it('records the stored status Core would hold at the seed’s clock, apart from the view state', () => {
    for (const s of seed.subscriptions) {
      expect(s.status).toBe(Date.parse(s.currentPeriodEnd!) > NOW ? 'active' : 'grace');
    }
  });
});

describe('subscription facts: the seed’s projections are unchanged', () => {
  // The values the pre-WP-3.1 selectors give for this seed at NOW (verified against `origin/main` 376e310). The
  // ending-soon figures are 5 and 3: demo-world.spec's older `3` and `1` already failed on that baseline.
  it('distributes each Platform’s subscriptions as before', () => {
    expect(
      subscriptionDistribution(seed, organizationsOf(seed, DEMO_SCHOOL_PLATFORM_ID), NOW, 14),
    ).toEqual({ organizations: 16, active: 13, grace: 1, none: 2, endingSoon: 5, entitled: 14 });
    expect(
      subscriptionDistribution(seed, organizationsOf(seed, DEMO_DRIVE_PLATFORM_ID), NOW, 14),
    ).toEqual({ organizations: 8, active: 7, grace: 0, none: 1, endingSoon: 3, entitled: 7 });
  });
});

describe('subscription facts: entitlement window boundaries (Core deriveEntitlement)', () => {
  const window = (at: number, record: OrganizationSubscriptionRecord | null = fact()) =>
    entitlementWindowOf(record, at);

  it('is not valid before the period starts', () => {
    // Only a fresh fixture period can start in the future here: the mock models no renewal (CFU-1 is not reproduced).
    expect(window(START - 1)).toEqual({ valid: false, expiresAt: null });
  });

  it('is valid from the period start (inclusive) until the grace ends (exclusive)', () => {
    expect(window(START)).toEqual({ valid: true, expiresAt: iso(GRACE) });
    expect(window(END - 1)).toEqual({ valid: true, expiresAt: iso(GRACE) });
    expect(window(END)).toEqual({ valid: true, expiresAt: iso(GRACE) });
    expect(window(GRACE - 1)).toEqual({ valid: true, expiresAt: iso(GRACE) });
    expect(window(GRACE)).toEqual({ valid: false, expiresAt: null });
  });

  it('projects active before the period end and grace from it, with the grace end', () => {
    const world = worldWith(fact());
    expect(subscriptionStateOf(world, ORG, START)).toEqual({ state: 'active' });
    expect(subscriptionStateOf(world, ORG, END - 1)).toEqual({ state: 'active' });
    expect(subscriptionStateOf(world, ORG, END)).toEqual({
      state: 'grace',
      graceEndsAt: iso(GRACE),
    });
    expect(subscriptionStateOf(world, ORG, GRACE - 1).state).toBe('grace');
    expect(subscriptionStateOf(world, ORG, GRACE)).toEqual({ state: 'none' });
    expect(entitlementOf(world, ORG, END - 1)).toBe('entitled');
    expect(entitlementOf(world, ORG, END)).toBe('entitledInGrace');
    expect(entitlementOf(world, ORG, GRACE)).toBe('notEntitled');
  });

  it('never entitles a pending subscription, which has no period', () => {
    expect(window(START, PENDING)).toEqual({ valid: false, expiresAt: null });
    const world = worldWith(PENDING);
    expect(subscriptionStateOf(world, ORG, START)).toEqual({ state: 'none' });
    expect(subscriptionEndOf(world, ORG)).toBeNull();
    expect(subscriptionEndsWithin(world, ORG, START, 365)).toBe(false);
    // Still a record: pending is not the absence of a subscription.
    expect(subscriptionFactOf(world, ORG)).toEqual(PENDING);
  });

  it('answers no record as not entitled, and as no fact', () => {
    expect(window(START, null)).toEqual({ valid: false, expiresAt: null });
    expect(
      subscriptionFactOf(worldWith(fact()), organizationId('00000000-0000-4000-8000-000000000000')),
    ).toBeNull();
  });
});

describe('subscription facts: termination only shortens access', () => {
  const T = END - 5 * 24 * HOUR;

  it('ends access exactly at an effective termination inside the period', () => {
    const terminated = fact({ status: 'expired', effectiveTerminationAt: iso(T) });
    expect(entitlementWindowOf(terminated, T - 1)).toEqual({ valid: true, expiresAt: iso(T) });
    expect(entitlementWindowOf(terminated, T)).toEqual({ valid: false, expiresAt: null });
    const world = worldWith(terminated);
    expect(subscriptionStateOf(world, ORG, T - 1)).toEqual({ state: 'active' });
    expect(subscriptionStateOf(world, ORG, T)).toEqual({ state: 'none' });
    expect(subscriptionEndOf(world, ORG)).toBe(iso(T));
  });

  it('ends the grace early when the termination falls inside it', () => {
    const inGrace = END + 6 * HOUR;
    const world = worldWith(fact({ effectiveTerminationAt: iso(inGrace) }));
    expect(subscriptionStateOf(world, ORG, END)).toEqual({
      state: 'grace',
      graceEndsAt: iso(inGrace),
    });
    expect(subscriptionStateOf(world, ORG, inGrace).state).toBe('none');
    expect(subscriptionEndOf(world, ORG)).toBe(iso(END));
  });

  it('never classifies a terminated subscription as ending soon', () => {
    const world = worldWith(fact({ effectiveTerminationAt: iso(T) }));
    expect(subscriptionEndsWithin(world, ORG, T - 24 * HOUR, 14)).toBe(false);
    expect(subscriptionEndsWithin(worldWith(fact()), ORG, T - 24 * HOUR, 14)).toBe(true);
  });

  it('refuses a termination that would extend access, as Core’s invariant does', () => {
    expect(() =>
      entitlementWindowOf(fact({ effectiveTerminationAt: iso(GRACE + 1) }), START),
    ).toThrow();
  });
});

describe('subscription facts: cancellation, stored status and expiry', () => {
  const instants = [START - 1, START, END - 1, END, GRACE - 1, GRACE];

  it('never lets cancelAtPeriodEnd shorten access already paid for', () => {
    const cancelling = fact({ cancelAtPeriodEnd: true });
    for (const at of instants) {
      expect(entitlementWindowOf(cancelling, at)).toEqual(entitlementWindowOf(fact(), at));
      expect(subscriptionStateOf(worldWith(cancelling), ORG, at)).toEqual(
        subscriptionStateOf(worldWith(fact()), ORG, at),
      );
    }
    expect(subscriptionEndsWithin(worldWith(cancelling), ORG, END - 24 * HOUR, 14)).toBe(true);
  });

  it('derives entitlement from timestamps, never from a stale stored status', () => {
    for (const status of ['active', 'grace', 'expired'] as const) {
      for (const at of instants) {
        expect(entitlementWindowOf(fact({ status }), at)).toEqual(entitlementWindowOf(fact(), at));
      }
    }
    // Core never sweeps statuses: a row still labelled `active` inside its grace window is in grace.
    expect(subscriptionStateOf(worldWith(fact({ status: 'active' })), ORG, END).state).toBe(
      'grace',
    );
  });

  it('keeps an expired subscription’s last period: not entitled, not ending soon, never absent', () => {
    const expired = fact({ status: 'expired' });
    const world = worldWith(expired);
    const later = GRACE + 30 * 24 * HOUR;
    expect(entitlementWindowOf(expired, later)).toEqual({ valid: false, expiresAt: null });
    expect(subscriptionStateOf(world, ORG, later)).toEqual({ state: 'none' });
    expect(subscriptionEndsWithin(world, ORG, later, 365)).toBe(false);
    expect(subscriptionFactOf(world, ORG)).toEqual(expired);
    expect(subscriptionEndOf(world, ORG)).toBe(iso(END));
  });

  it('refuses records that break Core’s period and grace invariants', () => {
    expect(() =>
      entitlementWindowOf(fact({ currentPeriodStart: null, currentPeriodEnd: null }), START),
    ).toThrow();
    expect(() => entitlementWindowOf(fact({ currentPeriodStart: iso(END) }), START)).toThrow();
    expect(() => entitlementWindowOf(fact({ graceUntil: iso(END) }), START)).toThrow();
  });
});

describe('subscription facts: read only', () => {
  it('is never changed by creating a Platform', () => {
    const outcome = createPlatform(seed, {
      companyId: DEMO_COMPANY_ID,
      name: 'Nawara Academy',
      idempotencyKey: 'wp-3-1',
      actor: DEMO_OWNER_ID,
      now: NOW,
    });
    if (!outcome.ok) throw new Error(`refused: ${outcome.error.kind}`);
    expect(outcome.world.subscriptions).toEqual(seed.subscriptions);
  });

  it('is never changed by creating an operator', () => {
    const outcome = createOperator({
      actor: DEMO_OWNER_ID,
      contact: { kind: 'email', email: 'wp-3-1.operator@demo.nawara.invalid' },
      reservedContacts: new Set<string>(),
      now: NOW,
    })(seed);
    if (!outcome.ok) throw new Error(`refused: ${outcome.error.kind}`);
    expect(outcome.world.subscriptions).toEqual(seed.subscriptions);
  });
});
