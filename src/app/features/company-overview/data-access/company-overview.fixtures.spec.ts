import { DEMO_COMPANY_DIRECTORY } from '../../../core/context/scope-directory.fixtures';
import { Metric } from '../domain/company-overview.model';
import { CORE_SERVICES } from '../domain/service-health.model';
import {
  DEMO_COMMERCIAL_SUMMARY,
  DEMO_COMPANY_OVERVIEW,
  DEMO_SERVICE_HEALTH,
} from './company-overview.fixtures';
import { NEWEST_ACTIVITY_AGE_MS, rebaseActivity } from './company-overview.mock';

const value = (metric: Metric): number => {
  if (metric.status !== 'available') throw new Error('expected an available metric');
  return metric.value;
};

describe('Company Overview demo fixtures (fictional, but internally consistent)', () => {
  const { summary, platforms, access } = DEMO_COMPANY_OVERVIEW;

  it('counts the directory’s platforms', () => {
    expect(value(summary.platforms)).toBe(DEMO_COMPANY_DIRECTORY.platforms.length);
    expect(platforms.map((p) => p.platform.id)).toEqual(
      DEMO_COMPANY_DIRECTORY.platforms.map((p) => p.id),
    );
  });

  it('adds up organizations across platforms', () => {
    const total = platforms.reduce((sum, p) => sum + value(p.organizations), 0);
    expect(value(summary.organizations)).toBe(total);
  });

  it('does not derive unique identities by summing platform memberships', () => {
    const memberships = platforms.reduce((sum, p) => sum + value(p.memberships), 0);
    const identities = value(summary.uniqueIdentities);
    expect(identities).not.toBe(memberships);
    expect(identities).toBeLessThanOrEqual(memberships);
  });

  it('distinguishes operator assignments from unique operators', () => {
    if (access.status !== 'available') throw new Error('expected access figures');
    const perPlatform = platforms.reduce((sum, p) => sum + value(p.operators), 0);
    const assignments = value(access.data.operatorAssignments);
    const operators = value(access.data.uniqueOperators);
    expect(assignments).toBe(perPlatform);
    expect(operators).toBeLessThan(assignments);
    expect(value(access.data.platformsWithOperators)).toBeLessThanOrEqual(platforms.length);
  });

  it('ends the growth history at the current organization total', () => {
    const growth = DEMO_COMPANY_OVERVIEW.growth;
    if (growth.status !== 'available') throw new Error('expected growth data');
    expect(growth.data.points.at(-1)?.organizations).toBe(value(summary.organizations));
  });

  it('keeps expiring licenses within the active ones', () => {
    expect(value(DEMO_COMMERCIAL_SUMMARY.expiringSoon)).toBeLessThanOrEqual(
      value(DEMO_COMMERCIAL_SUMMARY.activeLicenses),
    );
  });

  it('lists every Core service in the health strip, Auth included', () => {
    expect(DEMO_SERVICE_HEALTH.services.map((s) => s.service)).toEqual([...CORE_SERVICES]);
    expect(DEMO_SERVICE_HEALTH.services.map((s) => s.service)).toContain('auth');
  });

  it('adds up the per-platform growth to the total on every day', () => {
    const growth = DEMO_COMPANY_OVERVIEW.growth;
    if (growth.status !== 'available') throw new Error('expected growth');
    growth.data.points.forEach((point, i) => {
      const sum = growth.data.platforms.reduce((n, p) => n + (p.points[i]?.organizations ?? 0), 0);
      expect(growth.data.platforms.every((p) => p.points[i]?.day === point.day)).toBe(true);
      expect(sum).toBe(point.organizations);
    });
  });

  it('rebases the fictional activity so the newest entry is two hours old, keeping the gaps', () => {
    const activity = DEMO_COMPANY_OVERVIEW.activity;
    if (activity.status !== 'available') throw new Error('expected activity');
    const now = Date.parse('2026-10-12T12:00:00Z');
    const rebased = rebaseActivity(activity.data, now);
    const times = (entries: readonly { occurredAt: string }[]) =>
      entries.map((e) => Date.parse(e.occurredAt));
    expect(now - Math.max(...times(rebased))).toBe(NEWEST_ACTIVITY_AGE_MS);
    const gaps = (t: number[]) => t.slice(1).map((v, i) => (t[i] ?? 0) - v);
    expect(gaps(times(rebased))).toEqual(gaps(times(activity.data)));
  });
});
