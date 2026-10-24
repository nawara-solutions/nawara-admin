import { DOCUMENT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import en from '../../../../i18n/en.json';
import { homePath } from '../../../core/access/home-path';
import { Actor } from '../../../core/auth/actor';
import { AuthGateway } from '../../../core/auth/auth.gateway';
import { MockAuthGateway } from '../../../core/auth/auth.mock';
import { AuthSession } from '../../../core/auth/auth-session';
import { OperatorGrantsRefresh } from '../../../core/auth/operator-grants-refresh';
import { ScopeContext } from '../../../core/context/scope-context';
import { organizationsPath } from '../../../core/context/scope-context';
import {
  grantPlatformAssignment,
  revokePlatformAssignment,
} from '../../../demo/world/commands/operator.commands';
import { DEMO_WORLD_SEED, DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId, DemoWorldTables } from '../../../demo/world/records';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../../../demo/world/seed';
import { platformViewerOf } from '../../../demo/world/selectors';
import { OrganizationDirectoryFacade } from '../application/organization-directory.facade';
import { OrganizationGateway } from '../data-access/organization.gateway';
import { organizationActionTestProviders } from '../testing/organization-actions-testing';
import { operatorOf, owner, renderMembers, text } from '../testing/members-testing';
import { OrganizationDirectoryPage } from './organization-directory.page';

const S = DEMO_SCHOOL_PLATFORM_ID;
const D = DEMO_DRIVE_PLATFORM_ID;
const ID = DEMO_OPERATOR_IDS;
const NOW = Date.parse('2026-10-23T12:00:00Z');

/** The demo world as it is AFTER the owner's change, while the operator's session still holds its sign-in grants. */
const changedWorld =
  (change: (world: DemoWorldTables) => DemoWorldTables) =>
  (now: number): DemoWorldTables =>
    change(demoWorldSeed(now));

const revoked =
  (operatorId: AdminIdentityId, platformId: typeof S) =>
  (world: DemoWorldTables): DemoWorldTables => {
    const outcome = revokePlatformAssignment({
      actor: DEMO_OWNER_ID,
      operatorId,
      platformId,
      now: NOW,
    })(world);
    return outcome.ok ? outcome.world : world;
  };

const granted =
  (operatorId: AdminIdentityId, platformId: typeof S) =>
  (world: DemoWorldTables): DemoWorldTables => {
    const outcome = grantPlatformAssignment({
      actor: DEMO_OWNER_ID,
      operatorId,
      platformId,
      now: NOW,
    })(world);
    return outcome.ok ? outcome.world : world;
  };

async function setUp(
  actor: Actor,
  identity: AdminIdentityId,
  url: string,
  world: (now: number) => DemoWorldTables = demoWorldSeed,
) {
  const rendered = await renderMembers(OrganizationDirectoryPage, actor, identity, url, {
    extraProviders: [
      { provide: DEMO_WORLD_SEED, useValue: world },
      { provide: AuthGateway, useClass: MockAuthGateway },
      OperatorGrantsRefresh,
      OrganizationDirectoryFacade,
      ...organizationActionTestProviders(true),
    ],
  });
  await rendered.settle(40);
  const session = TestBed.inject(AuthSession);
  const grants = vi.spyOn(TestBed.inject(AuthGateway), 'grants');
  const lists = vi.spyOn(TestBed.inject(OrganizationGateway), 'list');
  const platforms = () => {
    const a = session.actor();
    return a?.kind === 'operator' ? a.platformAssignments : null;
  };
  const visible = async () => {
    TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
    await rendered.settle(40);
  };
  return {
    ...rendered,
    session,
    grants,
    lists,
    platforms,
    visible,
    scope: TestBed.inject(ScopeContext),
  };
}

describe('Signed-in operator Platform list refresh (P6-S2b)', { timeout: 15_000 }, () => {
  it('refreshes after a refused Platform: the removed Platform leaves the list, the refusal stands', async () => {
    const s = await setUp(
      operatorOf(ID.multi, [S, D]),
      ID.multi,
      organizationsPath(D),
      changedWorld(revoked(ID.multi, D)),
    );
    // Core (the mock, live from the world) refused Drive; the grants were re-read once.
    expect(s.platforms()).toEqual([S]);
    expect(text(s.element.querySelector('[data-grants-notice="refreshed"]'))).toBe(
      en.shell.grantsRefresh.refreshed,
    );
    expect(text(s.element.querySelector('h1'))).toBe(en.organizations.states.notAccessibleTitle);
    // Still refused, never resent or re-navigated; authority itself is the world's.
    expect(s.router.url).toBe(organizationsPath(D));
    expect(s.lists).not.toHaveBeenCalled();
    expect(platformViewerOf(s.world.snapshot(), ID.multi, D)).toBeNull();
    const scope = s.scope.platforms();
    expect(scope.status === 'success' ? scope.data.map((p) => p.id) : null).toEqual([S]);
    // The notice never names the Platform, an administrator or a time.
    expect(text(s.element.querySelector('[data-grants-notice]'))).not.toContain('Drive');
  });

  it('shows a Platform given while the session lasts after the tab is visible again', async () => {
    const s = await setUp(
      operatorOf(ID.school, [S]),
      ID.school,
      organizationsPath(S),
      changedWorld(granted(ID.school, D)),
    );
    expect(s.platforms()).toEqual([S]);
    // A refusal for a Platform the list does not show asks for nothing.
    s.scope.platformRefused(D);
    await s.settle(20);
    expect(s.grants).not.toHaveBeenCalled();
    await s.visible();
    expect(s.grants).toHaveBeenCalledTimes(1);
    expect(s.platforms()).toEqual([S, D]);
    // Nothing was refused, so nothing is said.
    expect(s.element.querySelector('[data-grants-notice]')).toBeNull();
  });

  it('refreshes once per Platform switch, never on the first Platform, and on "Try again"', async () => {
    const s = await setUp(operatorOf(ID.multi, [S, D]), ID.multi, organizationsPath(S));
    expect(s.grants).not.toHaveBeenCalled();
    await s.router.navigateByUrl(organizationsPath(D));
    await s.settle(40);
    expect(s.grants).toHaveBeenCalledTimes(1);
    await s.router.navigateByUrl(`${organizationsPath(D)}?sort=name`);
    await s.settle(40);
    expect(s.grants).toHaveBeenCalledTimes(1);
    s.scope.reload();
    await s.settle(40);
    expect(s.grants).toHaveBeenCalledTimes(2);
    // No polling.
    await s.settle(200);
    expect(s.grants).toHaveBeenCalledTimes(2);
  });

  it('leads home to the established no-access page once the last Platform is gone', async () => {
    const s = await setUp(
      operatorOf(ID.phone, [D]),
      ID.phone,
      organizationsPath(D),
      changedWorld(revoked(ID.phone, D)),
    );
    expect(s.platforms()).toEqual([]);
    expect(homePath(s.session.actor())).toBe('/forbidden');
  });

  it('ends the session on a genuine 401 (the operator was blocked) and opens sign-in', async () => {
    const s = await setUp(
      operatorOf(ID.multi, [S, D]),
      ID.multi,
      organizationsPath(S),
      changedWorld((world) => ({
        ...world,
        operators: world.operators.map((o) => (o.id === ID.multi ? { ...o, blocked: true } : o)),
      })),
    );
    // This test bed has no sign-in route: the navigation asked for is what is checked.
    const navigate = vi.spyOn(s.router, 'navigate').mockResolvedValue(true);
    await s.visible();
    expect(s.session.actor()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'session-expired' },
    });
  });

  it('keeps the list and the refusal on a transient failure, says so, and retries on request', async () => {
    const s = await setUp(operatorOf(ID.school, [S]), ID.school, organizationsPath(S));
    s.grants.mockReturnValueOnce(
      new (await import('rxjs')).Observable((sub) =>
        sub.error({ kind: 'unavailable', status: 503 }),
      ),
    );
    s.scope.platformRefused(S);
    await s.settle(40);
    expect(s.platforms()).toEqual([S]);
    expect(TestBed.inject(OperatorGrantsRefresh).notice()).toEqual({
      kind: 'unavailable',
      platformId: S,
    });
    TestBed.inject(OperatorGrantsRefresh).refresh('retry', S);
    await s.settle(40);
    expect(TestBed.inject(OperatorGrantsRefresh).notice()).toEqual({
      kind: 'refreshed',
      platformId: S,
    });
  });

  it('never refreshes an owner’s scope', async () => {
    const s = await setUp(owner, DEMO_OWNER_ID, organizationsPath(S));
    await s.visible();
    await s.router.navigateByUrl(organizationsPath(D));
    await s.settle(40);
    s.scope.platformRefused(D);
    s.scope.reload();
    await s.settle(40);
    expect(s.grants).not.toHaveBeenCalled();
    expect(s.session.actor()).toEqual(owner);
  });

  it('keeps refusing a removed Platform after the refresh (authorization is never relaxed)', async () => {
    await setUp(
      operatorOf(ID.multi, [S, D]),
      ID.multi,
      organizationsPath(D),
      changedWorld(revoked(ID.multi, D)),
    );
    const error = await firstValueFrom(TestBed.inject(OrganizationGateway).list(D)).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ status: 404 });
    expect(
      TestBed.inject(DemoWorld)
        .snapshot()
        .assignments.filter((a) => a.revokedAt === null),
    ).toHaveLength(4);
  });
});
