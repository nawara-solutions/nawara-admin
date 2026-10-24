import { loadShellRoutes } from '../../layout/shell.routes';
import { sessionGuard } from '../../core/access/access.guards';
import { NotificationsFacade } from './application/notifications.facade';
import { NOTIFICATIONS_ROUTES } from './notifications.routes';

describe('notifications routes (P8-S3)', () => {
  it('is open to every signed-in person: no capability guard, under the shell’s session guard', async () => {
    const [shell] = await loadShellRoutes({ production: true, demo: null });
    // Signed out: the shell's session guard sends the visitor to sign in, as for every page.
    expect(shell?.canActivate).toEqual([sessionGuard]);
    const route = shell?.children?.find((r) => r.path === 'notifications');
    expect(route).toBeDefined();
    expect(route?.canActivate).toBeUndefined();
    expect(route?.title).toBe('titles.notifications');
  });

  it('binds no gateway of its own: the count is the shell’s one NotificationIndicator', () => {
    expect(NOTIFICATIONS_ROUTES[0]?.providers).toEqual([NotificationsFacade]);
  });
});
