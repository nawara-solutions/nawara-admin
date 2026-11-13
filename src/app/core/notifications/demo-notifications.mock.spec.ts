import { DemoWorldTables } from '../../demo/world/records';
import { demoWorldSeed } from '../../demo/world/seed';
import {
  activeAdminInvitationsOf,
  organizationsOfCompany,
  subscriptionEndsWithin,
  subscriptionFactOf,
  subscriptionStateOf,
  subscriptionsEndingWithin,
} from '../../demo/world/selectors';
import { NOTIFICATION_ENDING_WITHIN_DAYS, derivedNotificationsOf } from './demo-notifications.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const DAY_MS = 86_400_000;
const world = demoWorldSeed(NOW);
const ids = (w: DemoWorldTables, now = NOW) => derivedNotificationsOf(w, now).map((n) => n.id);

/** Freezes every table, so a selector that writes would throw. */
function frozen(tables: DemoWorldTables): DemoWorldTables {
  const deep = <T>(value: T): T => {
    if (value && typeof value === 'object') {
      for (const inner of Object.values(value)) deep(inner);
      Object.freeze(value);
    }
    return value;
  };
  return deep(structuredClone(tables));
}

describe('Derived notifications (WP-3.4)', () => {
  it('derives one notification per supported condition, and nothing else', () => {
    const organizations = organizationsOfCompany(world);
    const expected = new Set<string>();
    for (const o of organizations) {
      if (subscriptionStateOf(world, o.id, NOW).state === 'grace')
        expected.add(`subscription-grace:${o.id}`);
      else if (subscriptionEndsWithin(world, o.id, NOW, NOTIFICATION_ENDING_WITHIN_DAYS))
        expected.add(`subscription-ending:${o.id}`);
      for (const i of activeAdminInvitationsOf(world, [o], NOW))
        expected.add(`admin-invitation:${i.id}`);
      if (world.memberships.some((m) => m.organizationId === o.id && m.status === 'pending'))
        expected.add(`membership-requests:${o.id}`);
    }
    expect(expected.size).toBeGreaterThan(0);
    expect(new Set(ids(world))).toEqual(expected);
    for (const n of derivedNotificationsOf(world, NOW)) {
      expect(n.id.startsWith('subscription-grace:'), n.id).toBe(n.priority === 'urgent');
      expect(n.titleKey, n.id).toMatch(
        /^notifications\.records\.(licenseGrace|license|invitation|approval)\.title$/,
      );
    }
  });

  it('agrees with the subscription figures the other views show', () => {
    const organizations = organizationsOfCompany(world);
    const notified = ids(world);
    expect(notified.filter((id) => id.startsWith('subscription-ending:'))).toHaveLength(
      subscriptionsEndingWithin(world, organizations, NOW, NOTIFICATION_ENDING_WITHIN_DAYS),
    );
    expect(notified.filter((id) => id.startsWith('subscription-grace:'))).toHaveLength(
      organizations.filter((o) => subscriptionStateOf(world, o.id, NOW).state === 'grace').length,
    );
  });

  it('goes away when its condition no longer holds', () => {
    const decided: DemoWorldTables = {
      ...world,
      memberships: world.memberships.map((m) =>
        m.status === 'pending'
          ? { ...m, status: 'active', approvedAt: new Date(NOW).toISOString() }
          : m,
      ),
      adminInvitations: world.adminInvitations.map((i) => ({
        ...i,
        revokedAt: i.revokedAt ?? new Date(NOW - 1).toISOString(),
      })),
    };
    expect(
      ids(decided).filter((id) => /^(membership-requests|admin-invitation):/.test(id)),
    ).toEqual([]);
    // The subscription notifications are unaffected by those changes.
    expect(ids(decided).filter((id) => id.startsWith('subscription-'))).toEqual(
      ids(world).filter((id) => id.startsWith('subscription-')),
    );
    expect(
      ids({ ...world, subscriptions: [] }).filter((id) => id.startsWith('subscription-')),
    ).toEqual([]);
  });

  it('uses explicit time boundaries: the 14-day window, and an invitation’s expiry', () => {
    const ending = organizationsOfCompany(world).find((o) =>
      subscriptionEndsWithin(world, o.id, NOW, NOTIFICATION_ENDING_WITHIN_DAYS),
    )!;
    const end = Date.parse(subscriptionFactOf(world, ending.id)!.currentPeriodEnd!);
    const id = `subscription-ending:${ending.id}`;
    const windowStart = end - NOTIFICATION_ENDING_WITHIN_DAYS * DAY_MS;
    expect(ids(world, windowStart)).toContain(id);
    expect(ids(world, windowStart - 1)).not.toContain(id);
    expect(derivedNotificationsOf(world, windowStart).find((n) => n.id === id)?.createdAt).toBe(
      new Date(windowStart).toISOString(),
    );
    // At its end it is no longer "ending": it is in grace, or ended.
    expect(ids(world, end)).not.toContain(id);
    const invitation = activeAdminInvitationsOf(world, organizationsOfCompany(world), NOW)[0]!;
    const expires = Date.parse(invitation.expiresAt);
    expect(ids(world, expires - 1)).toContain(`admin-invitation:${invitation.id}`);
    expect(ids(world, expires)).not.toContain(`admin-invitation:${invitation.id}`);
    // Nothing is dated in the future.
    for (const n of derivedNotificationsOf(world, NOW))
      expect(Date.parse(n.createdAt)).toBeLessThanOrEqual(NOW);
  });

  it('gives stable ids, no duplicates, and a deterministic order', () => {
    const first = derivedNotificationsOf(world, NOW);
    expect(new Set(first.map((n) => n.id)).size).toBe(first.length);
    expect(derivedNotificationsOf(demoWorldSeed(NOW), NOW)).toEqual(first);
    const times = first.map((n) => Date.parse(n.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // One "membership requests" notification per Organization, however many requests it has.
    const perOrganization = first.filter((n) => n.id.startsWith('membership-requests:'));
    expect(new Set(perOrganization.map((n) => n.context)).size).toBe(perOrganization.length);
  });

  it('keeps each notification to its own Organization and Platform, and never another Company’s', () => {
    for (const n of derivedNotificationsOf(world, NOW)) {
      const organizationId = n.id.split(':')[1]!;
      const organization =
        world.organizations.find((o) => o.id === organizationId) ??
        world.organizations.find(
          (o) =>
            o.id === world.adminInvitations.find((i) => i.id === organizationId)?.organizationId,
        )!;
      const platform = world.platforms.find((p) => p.id === organization.platformId)!;
      expect(n.context, n.id).toBe(`${organization.name} · ${platform.name}`);
      if (n.destination !== '/licenses')
        expect(n.destination, n.id).toBe(
          `/platforms/${platform.id}/organizations/${organization.id}/members`,
        );
    }
    // An Organization on a Platform of another Company is never notified, whatever it holds.
    const foreignPlatform = {
      ...world.platforms[0]!,
      id: 'foreign-platform',
      companyId: 'other-company',
    };
    const foreign = {
      ...world.organizations[0]!,
      id: 'foreign-org',
      platformId: foreignPlatform.id,
    };
    const withForeign = {
      ...world,
      platforms: [...world.platforms, foreignPlatform],
      organizations: [...world.organizations, foreign],
      memberships: [
        ...world.memberships,
        {
          ...world.memberships[0]!,
          id: 'foreign-m',
          organizationId: foreign.id,
          status: 'pending' as const,
        },
      ],
    } as DemoWorldTables;
    expect(ids(withForeign).some((id) => id.includes('foreign'))).toBe(false);
  });

  it('makes no financial claim: payment facts never create or remove a notification', () => {
    expect(ids(world).some((id) => /payment|refund|collect|billing/i.test(id))).toBe(false);
    const allFailed: DemoWorldTables = {
      ...world,
      paymentRequests: world.paymentRequests.map((r) => ({ ...r, status: 'failed' as const })),
      paymentAttempts: world.paymentAttempts.map((a) => ({ ...a, status: 'unknown' as const })),
    };
    expect(ids(allFailed)).toEqual(ids(world));
    expect(ids({ ...world, paymentRequests: [], providerFacts: [], refundCases: [] })).toEqual(
      ids(world),
    );
  });

  it('notifies nothing from absent data', () => {
    const empty: DemoWorldTables = {
      ...world,
      subscriptions: [],
      adminInvitations: [],
      memberships: [],
    };
    expect(derivedNotificationsOf(empty, NOW)).toEqual([]);
    expect(derivedNotificationsOf({ ...world, organizations: [] }, NOW)).toEqual([]);
  });

  it('reads without writing: it runs over a frozen world', () => {
    const still = frozen(world);
    expect(derivedNotificationsOf(still, NOW)).toEqual(derivedNotificationsOf(world, NOW));
    expect(still).toEqual(world);
  });
});
