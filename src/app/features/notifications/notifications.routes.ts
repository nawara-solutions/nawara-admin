import { Routes } from '@angular/router';

/**
 * Notifications (`/notifications`; P8-S3): the signed-in person's own, so no capability guard (the shell's session
 * guard sends a signed-out visitor to sign in). The count's gateway is the shell's (bound there with the badge and the
 * bell, docs/ARCHITECTURE.md §3): demo inbox records in a demo build, `unavailable` otherwise.
 */
export const NOTIFICATIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/notifications.page').then((m) => m.NotificationsPage),
  },
];
