import { DemoWorldTables, OrganizationSubscriptionRecord } from './records';
import { demoWorldSeed } from './seed';
import {
  entitlementOf,
  organizationsOfCompany,
  subscriptionLifecycleOf,
  subscriptionStateOf,
} from './selectors';
import {
  cancellationScheduled,
  terminationScheduled,
} from '../../shared/subscription/subscription-lifecycle';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (t: number) => new Date(t).toISOString();
const seed = demoWorldSeed(NOW);
const ORG = organizationsOfCompany(seed)[0]!.id;

/** A TEST-ONLY world in which one Organization holds exactly this record (the main seed is never changed). */
function withRecord(record: Partial<OrganizationSubscriptionRecord> | null): DemoWorldTables {
  const others = seed.subscriptions.filter((s) => s.organizationId !== ORG);
  if (record === null) return { ...seed, subscriptions: others };
  const end = NOW + 10 * DAY;
  const full: OrganizationSubscriptionRecord = {
    organizationId: ORG,
    status: 'active',
    currentPeriodStart: iso(end - 365 * DAY),
    currentPeriodEnd: iso(end),
    graceUntil: iso(end + DAY),
    cancelAtPeriodEnd: false,
    effectiveTerminationAt: null,
    ...record,
  };
  return { ...seed, subscriptions: [...others, full] };
}

/** A period ending at `end` (grace 24 hours), stored with `status`. */
const period = (end: number, status: OrganizationSubscriptionRecord['status'] = 'active') => ({
  status,
  currentPeriodStart: iso(end - 365 * DAY),
  currentPeriodEnd: iso(end),
  graceUntil: iso(end + DAY),
});

const lifecycle = (world: DemoWorldTables, now = NOW) => subscriptionLifecycleOf(world, ORG, now);

describe('Subscription lifecycle (WP-4.1)', () => {
  it('tells no record, a pending record and a period not started yet apart: none is entitled', () => {
    expect(lifecycle(withRecord(null))).toMatchObject({ state: 'none', storedStatus: null });
    const pending = withRecord({
      status: 'pending',
      currentPeriodStart: null,
      currentPeriodEnd: null,
      graceUntil: null,
    });
    expect(lifecycle(pending)).toMatchObject({
      state: 'pending',
      storedStatus: 'pending',
      accessEndsAt: null,
    });
    const later = withRecord(period(NOW + 400 * DAY));
    expect(lifecycle(later).state).toBe('notStarted');
    for (const w of [withRecord(null), pending, later]) {
      expect(subscriptionStateOf(w, ORG, NOW).state).toBe('none');
      expect(entitlementOf(w, ORG, NOW)).toBe('notEntitled');
    }
  });

  it('reads active, then grace, then expired across the exact boundaries', () => {
    const end = NOW;
    const w = withRecord(period(end));
    expect(lifecycle(w, end - 1).state).toBe('active');
    expect(lifecycle(w, end).state).toBe('grace');
    expect(lifecycle(w, end + DAY - 1)).toMatchObject({
      state: 'grace',
      accessEndsAt: iso(end + DAY),
    });
    expect(lifecycle(w, end + DAY)).toMatchObject({ state: 'expired', accessEndsAt: null });
  });

  it('keeps expired apart from never subscribed', () => {
    const expired = withRecord(period(NOW - 30 * DAY, 'expired'));
    expect(lifecycle(expired)).toMatchObject({
      state: 'expired',
      currentPeriodEnd: iso(NOW - 30 * DAY),
      storedStatusLags: false,
    });
    expect(lifecycle(withRecord(null)).state).toBe('none');
    // Both are "no subscription" in the three-way view the figures count.
    expect(subscriptionStateOf(expired, ORG, NOW).state).toBe('none');
  });

  it('never trusts a stored status that lags the clock', () => {
    // Stored "active", but the grace ended a week ago: expired, and the stored value is shown as lagging.
    const lagging = withRecord(period(NOW - 8 * DAY, 'active'));
    expect(lifecycle(lagging)).toMatchObject({
      state: 'expired',
      storedStatus: 'active',
      storedStatusLags: true,
    });
    expect(entitlementOf(lagging, ORG, NOW)).toBe('notEntitled');
    // Stored "active" inside the grace: grace, also lagging.
    const inGrace = withRecord(period(NOW - HOUR, 'active'));
    expect(lifecycle(inGrace)).toMatchObject({ state: 'grace', storedStatusLags: true });
  });

  it('a scheduled cancellation is a condition: access is not lost before the period and grace end', () => {
    const end = NOW + 5 * DAY;
    const w = withRecord({ ...period(end), cancelAtPeriodEnd: true });
    expect(lifecycle(w)).toMatchObject({
      state: 'active',
      cancelAtPeriodEnd: true,
      accessEndsAt: iso(end + DAY),
    });
    expect(cancellationScheduled(lifecycle(w))).toBe(true);
    expect(entitlementOf(w, ORG, NOW)).toBe('entitled');
    expect(lifecycle(w, end + HOUR).state).toBe('grace');
    expect(cancellationScheduled(lifecycle(w, end + HOUR))).toBe(true);
    expect(lifecycle(w, end + DAY).state).toBe('expired');
    expect(cancellationScheduled(lifecycle(w, end + DAY))).toBe(false);
  });

  it('an effective termination ends access at its instant, and is reported before then', () => {
    const end = NOW + 20 * DAY;
    const termination = NOW + 2 * DAY;
    const w = withRecord({ ...period(end), effectiveTerminationAt: iso(termination) });
    expect(lifecycle(w)).toMatchObject({ state: 'active', accessEndsAt: iso(termination) });
    expect(terminationScheduled(lifecycle(w))).toBe(true);
    expect(lifecycle(w, termination - 1).state).toBe('active');
    expect(lifecycle(w, termination)).toMatchObject({ state: 'terminated', accessEndsAt: null });
    expect(entitlementOf(w, ORG, termination)).toBe('notEntitled');
  });

  it('agrees with the three-way view and the entitlement every screen counts, for every seeded Organization', () => {
    const coarse = { active: 'active', grace: 'grace' } as const;
    for (const o of organizationsOfCompany(seed)) {
      const l = lifecycle(seed, NOW);
      const view = subscriptionStateOf(seed, o.id, NOW).state;
      const own = subscriptionLifecycleOf(seed, o.id, NOW);
      expect(coarse[own.state as 'active' | 'grace'] ?? 'none', o.name).toBe(view);
      expect(own.accessEndsAt !== null, o.name).toBe(
        entitlementOf(seed, o.id, NOW) !== 'notEntitled',
      );
      expect(l).toBeDefined();
    }
  });

  it('leaves the main seed’s population as it was: only active, grace and no subscription', () => {
    const states = organizationsOfCompany(seed).map(
      (o) => subscriptionLifecycleOf(seed, o.id, NOW).state,
    );
    expect(new Set(states)).toEqual(new Set(['active', 'grace', 'none']));
    expect(
      seed.subscriptions.every((s) => !s.cancelAtPeriodEnd && s.effectiveTerminationAt === null),
    ).toBe(true);
  });

  it('reads without writing', () => {
    const w = withRecord({ ...period(NOW + DAY), cancelAtPeriodEnd: true });
    const before = structuredClone(w);
    for (const o of organizationsOfCompany(w)) subscriptionLifecycleOf(w, o.id, NOW);
    expect(w).toEqual(before);
  });
});
