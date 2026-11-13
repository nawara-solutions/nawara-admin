import { OrganizationRecord, DemoWorldTables } from '../../demo/world/records';
import {
  activeAdminInvitationsOf,
  organizationsOfCompany,
  platformRefOf,
  subscriptionEndsWithin,
  subscriptionFactOf,
  subscriptionStateOf,
} from '../../demo/world/selectors';
import { organizationPath } from '../context/scope-context';
import { NotificationRecord } from './notification-inbox.gateway';

/**
 * Demo notifications DERIVED from the shared demo world (WP-3.4): a pure reading of facts the other views already show, never
 * a stored or invented event. A notification exists exactly while its condition holds at `now`, and goes when it no longer
 * does. Read state is not part of it (the inbox keeps it, in memory).
 *
 * Supported conditions, each one notification per underlying record, with a stable id:
 * - `subscription-grace:<organization>`: the subscription's period ended and the Organization is entitled only until its grace
 *   ends (`subscriptionStateOf` is `grace`). Urgent. Since: the period end;
 * - `subscription-ending:<organization>`: an active subscription whose period ends within `NOTIFICATION_ENDING_WITHIN_DAYS`
 *   (`subscriptionEndsWithin`; a terminated or expired one never is). Since: the period end minus the window;
 * - `admin-invitation:<invitation>`: an administrator invitation still active, i.e. not consumed, revoked or expired
 *   (`activeAdminInvitationsOf`). Since: its creation;
 * - `membership-requests:<organization>`: one or more membership requests still pending. Since: the latest request.
 *
 * Not derived (no supporting fact, or no approved category): payment follow-ups (a payment request's status is no financial
 * outcome, and there is no Billing category), Organization creations and other events (no event notification is approved),
 * operator access requests (no such record exists).
 */

/** The "ending soon" window: the same 14 days as the Company Overview and Licenses figures. */
export const NOTIFICATION_ENDING_WITHIN_DAYS = 14;

const DAY_MS = 86_400_000;

export type DerivedNotification = Omit<NotificationRecord, 'unread'>;

/** The notifications the Company owner sees at `now`, newest first (then by id: deterministic). */
export function derivedNotificationsOf(
  world: DemoWorldTables,
  now: number,
): readonly DerivedNotification[] {
  return organizationsOfCompany(world)
    .flatMap((organization) => organizationNotifications(world, organization, now))
    .filter((n) => Date.parse(n.createdAt) <= now)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
}

function organizationNotifications(
  world: DemoWorldTables,
  organization: OrganizationRecord,
  now: number,
): DerivedNotification[] {
  const platform = platformRefOf(world, organization.platformId);
  if (!platform) return [];
  const context = `${organization.name} · ${platform.name}`;
  const path = organizationPath(organization.platformId, organization.id);
  const notifications: DerivedNotification[] = [];

  const subscription = subscriptionFactOf(world, organization.id);
  const periodEnd = subscription?.currentPeriodEnd ?? null;
  if (periodEnd !== null && subscriptionStateOf(world, organization.id, now).state === 'grace')
    notifications.push({
      id: `subscription-grace:${organization.id}`,
      category: 'license',
      titleKey: 'notifications.records.licenseGrace.title',
      descriptionKey: 'notifications.records.licenseGrace.description',
      context,
      createdAt: periodEnd,
      priority: 'urgent',
      destination: '/licenses',
    });
  else if (
    periodEnd !== null &&
    subscriptionEndsWithin(world, organization.id, now, NOTIFICATION_ENDING_WITHIN_DAYS)
  )
    notifications.push({
      id: `subscription-ending:${organization.id}`,
      category: 'license',
      titleKey: 'notifications.records.license.title',
      descriptionKey: 'notifications.records.license.description',
      context,
      createdAt: new Date(
        Date.parse(periodEnd) - NOTIFICATION_ENDING_WITHIN_DAYS * DAY_MS,
      ).toISOString(),
      priority: 'normal',
      destination: '/licenses',
    });

  for (const invitation of activeAdminInvitationsOf(world, [organization], now))
    notifications.push({
      id: `admin-invitation:${invitation.id}`,
      category: 'invitation',
      titleKey: 'notifications.records.invitation.title',
      descriptionKey: 'notifications.records.invitation.description',
      context,
      createdAt: invitation.createdAt,
      priority: 'normal',
      destination: `${path}/members`,
    });

  const pending = world.memberships.filter(
    (m) => m.organizationId === organization.id && m.status === 'pending',
  );
  if (pending.length > 0)
    notifications.push({
      id: `membership-requests:${organization.id}`,
      category: 'approval',
      titleKey: 'notifications.records.approval.title',
      descriptionKey: 'notifications.records.approval.description',
      context,
      createdAt: pending
        .map((m) => m.requestedAt)
        .sort()
        .at(-1)!,
      priority: 'normal',
      destination: `${path}/members`,
    });

  return notifications;
}
