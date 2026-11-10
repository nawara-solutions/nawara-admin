import type { NotificationCategory } from './notification-inbox.gateway';

export type NotificationFilterId =
  'all' | 'invitations' | 'approvals' | 'licenses' | 'access' | 'updates';

export const NOTIFICATION_FILTERS: readonly {
  readonly id: NotificationFilterId;
  readonly key: string;
  readonly categories: readonly NotificationCategory[];
}[] = [
  { id: 'all', key: 'notifications.filters.all', categories: [] },
  { id: 'invitations', key: 'notifications.filters.invitations', categories: ['invitation'] },
  { id: 'approvals', key: 'notifications.filters.approvals', categories: ['approval'] },
  { id: 'licenses', key: 'notifications.filters.licenses', categories: ['license'] },
  { id: 'access', key: 'notifications.filters.access', categories: ['access'] },
  { id: 'updates', key: 'notifications.filters.updates', categories: ['organization', 'system'] },
];
