import { demoWorldSeed } from '../../../demo/world/seed';
import { Metric } from '../domain/company-overview.model';
import { CORE_SERVICES } from '../domain/service-health.model';
import { DEMO_SERVICE_HEALTH } from './company-overview.fixtures';
import {
  RECENT_ACTIVITY,
  demoCommercialSummary,
  demoCompanyOverview,
} from './company-overview.mock';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const world = demoWorldSeed(NOW);
const overview = demoCompanyOverview(world, NOW);

const value = (metric: Metric): number => {
  if (metric.status !== 'available') throw new Error('expected an available metric');
  return metric.value;
};

describe('Company Overview of the demo world (derived from its records)', () => {
  const { summary, platforms, access } = overview;

  it('counts the world’s Platforms and adds up their Organizations', () => {
    expect(value(summary.platforms)).toBe(world.platforms.length);
    expect(platforms.map((p) => p.platform.id)).toEqual(world.platforms.map((p) => p.id));
    expect(platforms.map((p) => value(p.organizations))).toEqual([16, 8]);
    expect(value(summary.organizations)).toBe(24);
    expect(platforms.map((p) => value(p.memberships))).toEqual([920, 460]);
  });

  it('leaves unique identities unavailable: memberships are not identities, and no person records exist yet', () => {
    expect(summary.uniqueIdentities).toEqual({ status: 'unavailable' });
  });

  it('distinguishes operator assignments from unique operators', () => {
    if (access.status !== 'available') throw new Error('expected access figures');
    expect(value(access.data.operatorAssignments)).toBe(
      platforms.reduce((sum, p) => sum + value(p.operators), 0),
    );
    expect(value(access.data.operatorAssignments)).toBe(5);
    expect(value(access.data.uniqueOperators)).toBe(4);
    expect(value(access.data.platformsWithOperators)).toBe(2);
  });

  it('flags only the invitations awaiting acceptance (no access-review claim)', () => {
    expect(value(summary.pendingAdminInvitations)).toBe(7);
    expect(overview.attention).toEqual({
      status: 'available',
      data: [{ kind: 'admin_invitations_awaiting', count: 7 }],
    });
  });

  it('derives growth from creation dates: it ends at the total, and the Platforms add up on every day', () => {
    if (overview.growth.status !== 'available') throw new Error('expected growth');
    const { points, platforms: perPlatform } = overview.growth.data;
    expect(points.map((p) => p.organizations)).toEqual([21, 21, 22, 23, 24]);
    expect(points.at(-1)?.organizations).toBe(value(summary.organizations));
    points.forEach((point, i) => {
      expect(perPlatform.every((p) => p.points[i]?.day === point.day)).toBe(true);
      expect(perPlatform.reduce((n, p) => n + (p.points[i]?.organizations ?? 0), 0)).toBe(
        point.organizations,
      );
    });
  });

  it('shows the newest Platform events as one Company stream, newest first', () => {
    if (overview.activity.status !== 'available') throw new Error('expected activity');
    const entries = overview.activity.data;
    expect(entries).toHaveLength(RECENT_ACTIVITY);
    expect(entries.map((e) => e.id)).toEqual([
      'platform-activity-s1',
      'platform-activity-d1',
      'platform-activity-s2',
      'platform-activity-s3',
    ]);
    expect(entries[0]).toEqual({
      id: 'platform-activity-s1',
      action: 'organization.created',
      organizationName: 'École Horizon',
      platformName: 'Nawara School',
      occurredAt: '2026-10-23T10:00:00.000Z',
    });
  });

  it('derives the commercial summary from subscription end dates and payment records', () => {
    const commercial = demoCommercialSummary(world, NOW);
    expect(value(commercial.activeLicenses)).toBe(20);
    expect(value(commercial.expiringSoon)).toBe(4);
    expect(commercial.expiringWithinDays).toBe(14);
    expect(value(commercial.paymentIssues)).toBe(2);
    // Twenty days on, the subscriptions that were expiring have ended.
    const later = demoCommercialSummary(world, NOW + 20 * 86_400_000);
    expect(value(later.activeLicenses)).toBe(15);
  });

  it('lists every Core service in the health strip, Auth included', () => {
    expect(DEMO_SERVICE_HEALTH.services.map((s) => s.service)).toEqual([...CORE_SERVICES]);
  });
});
