import { sessionGuard } from '../../core/access/access.guards';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import { loadShellRoutes } from '../../layout/shell.routes';
import { SETTINGS_ROUTES } from './settings.routes';

const SECTIONS = SETTINGS_ROUTES[0]?.children ?? [];

describe('settings routes (P9-S1)', () => {
  it('is open to every signed-in person, owner or operator: no capability guard, under the shell’s session guard', async () => {
    const [shell] = await loadShellRoutes({ production: true, demo: null });
    expect(shell?.canActivate).toEqual([sessionGuard]);
    const route = shell?.children?.find((r) => r.path === 'settings');
    expect(route).toBeDefined();
    expect(route?.canActivate).toBeUndefined();
    // Personal settings have no capability guard; only Security (P9-S4a) and Company (P9-S3) are the owner's.
    for (const child of SECTIONS.filter((r) => r.path !== 'company' && r.path !== 'security'))
      expect(child.canActivate).toBeUndefined();
  });

  it('makes /settings a default Appearance page within one shared workspace, not a redirect, with Appearance, Language, Account, Security and Company below it', () => {
    expect(SECTIONS.map((r) => [r.path, r.title, r.redirectTo])).toEqual([
      ['', 'titles.settings', undefined],
      ['appearance', 'titles.settingsAppearance', undefined],
      ['language', 'titles.settingsLanguage', undefined],
      ['account', 'titles.settingsAccount', undefined],
      ['security', 'titles.settingsSecurity', undefined],
      ['company', 'titles.settingsCompany', undefined],
    ]);
    // P9-S2: the own account only; no route takes an identity parameter
    for (const route of SECTIONS) expect(route.path).not.toContain(':');
    const [hub, ...sections] = SECTIONS;
    expect(hub?.pathMatch).toBe('full');
    expect(hub?.data?.[BREADCRUMB_DATA]).toBe('shell.breadcrumb.settings');
    for (const section of sections) {
      expect(section.data?.[BREADCRUMB_PARENT_DATA]).toEqual({
        key: 'shell.breadcrumb.settings',
        link: '/settings',
      });
    }
  });

  it('binds no gateway or facade: browser-local preferences need none', () => {
    for (const route of SECTIONS) expect(route.providers).toBeUndefined();
  });
});
