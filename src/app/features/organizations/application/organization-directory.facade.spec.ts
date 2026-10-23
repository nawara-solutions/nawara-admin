import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NEVER, of, throwError } from 'rxjs';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { NW_CLOCK } from '../../../shared/format/clock';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import {
  ATLAS,
  Blank,
  DEMO,
  DRIVE,
  HORIZON,
  NOW,
  PLATFORMS,
  RIAD,
  SCHOOL,
  ScriptedCommercial,
  ScriptedDirectory,
  ScriptedOrganizations,
  commercialListOf,
  directoryOf,
  operator,
  owner,
} from '../testing/organizations-testing';
import { OrganizationDirectoryFacade } from './organization-directory.facade';

async function setUp(actor: Actor, url = '/platforms/school/organizations') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'platforms/:platformId/organizations', component: Blank },
        { path: 'platforms/:platformId', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ScopeDirectoryGateway, useClass: ScriptedDirectory },
      { provide: OrganizationGateway, useClass: ScriptedOrganizations },
      { provide: OrganizationCommercialGateway, useClass: ScriptedCommercial },
      ScopeContext,
      OrganizationDirectoryFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const facade = TestBed.inject(OrganizationDirectoryFacade);
  TestBed.tick();
  return {
    facade,
    router,
    organizations: TestBed.inject(OrganizationGateway) as ScriptedOrganizations,
    commercial: TestBed.inject(OrganizationCommercialGateway) as ScriptedCommercial,
  };
}

const settle = async () => {
  TestBed.tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  TestBed.tick();
};

describe('OrganizationDirectoryFacade', () => {
  afterEach(() => {
    ScriptedDirectory.answer = () => of(PLATFORMS);
  });

  it('loads the owner’s directory and commercial facts for the Platform in the URL, and joins them', async () => {
    const { facade, organizations, commercial } = await setUp(owner);
    expect(organizations.lists.map((r) => r.key)).toEqual([SCHOOL]);
    expect(commercial.lists.map((r) => r.key)).toEqual([SCHOOL]);
    expect(facade.view().status).toBe('loading');
    organizations.lists[0]?.answer.next(directoryOf());
    commercial.lists[0]?.answer.next(commercialListOf());
    expect(facade.view()).toMatchObject({ status: 'ready', platform: PLATFORMS[0] });
    expect(facade.rows().map((r) => [r.organization.id, r.commercial?.subscription.state])).toEqual(
      [
        [HORIZON, 'active'],
        [RIAD, 'active'],
        [ATLAS, 'none'],
      ],
    );
    expect(facade.totals()).toEqual({
      organizations: 3,
      memberships: { status: 'available', value: 206 },
      requests: { status: 'available', value: 8 },
      organizationsWithRequests: 2,
    });
  });

  it('never asks an operator’s commercial facts, and ignores a subscription filter in the URL', async () => {
    const { facade, organizations, commercial } = await setUp(
      operator,
      '/platforms/school/organizations?subscription=none',
    );
    organizations.lists[0]?.answer.next(directoryOf());
    expect(commercial.lists).toHaveLength(0);
    expect(facade.showsCommercial()).toBe(false);
    expect(facade.query().subscription).toBe('any');
    expect(facade.rows()).toHaveLength(3);
    expect(facade.rows().every((r) => r.commercial === null)).toBe(true);
  });

  it('requests nothing for a Platform outside the actor’s scope, nor while the Platforms are loading', async () => {
    const outside = await setUp(operator, '/platforms/drive/organizations');
    expect(outside.facade.view()).toEqual({ status: 'notAccessible' });
    expect(outside.organizations.lists).toHaveLength(0);
    TestBed.resetTestingModule();
    ScriptedDirectory.answer = () => NEVER;
    const checking = await setUp(owner);
    expect(checking.facade.view()).toEqual({ status: 'checking' });
    expect(checking.organizations.lists).toHaveLength(0);
  });

  it('tells an outage of the Platform list apart from a refusal', async () => {
    ScriptedDirectory.answer = () => throwError(() => ({ kind: 'unavailable', status: 503 }));
    const { facade, organizations } = await setUp(owner);
    expect(facade.view()).toEqual({ status: 'directoryUnavailable' });
    expect(organizations.lists).toHaveLength(0);
  });

  it('maps a refusal, an outage and a build without the contract to distinct states', async () => {
    const { facade, organizations } = await setUp(owner);
    organizations.lists[0]?.answer.error({ kind: 'not_found', status: 404 });
    expect(facade.view()).toMatchObject({ status: 'refused' });
    facade.reload();
    organizations.lists[1]?.answer.error({ kind: 'unavailable', status: 503 });
    expect(facade.view()).toMatchObject({ status: 'error' });
    facade.reload();
    organizations.lists[2]?.answer.error(adapterUnavailable());
    expect(facade.view()).toMatchObject({ status: 'notInBuild' });
  });

  it('cancels the request in flight when the Platform changes, and never shows another Platform’s answer', async () => {
    const { facade, organizations, router } = await setUp(owner);
    const first = organizations.lists[0];
    await router.navigateByUrl('/platforms/drive/organizations');
    await settle();
    expect(first?.live()).toBe(false);
    expect(organizations.lists.map((r) => r.key)).toEqual([SCHOOL, DRIVE]);
    organizations.lists[1]?.answer.next(directoryOf(SCHOOL));
    expect(facade.view()).toMatchObject({ status: 'loading' });
    organizations.lists[1]?.answer.next(directoryOf(DRIVE));
    expect(facade.view()).toMatchObject({ status: 'ready', platform: PLATFORMS[1] });
  });

  it('reads search, filters and sort from the URL and writes them back to it', async () => {
    const { facade, organizations, commercial, router } = await setUp(
      owner,
      '/platforms/school/organizations?requests=1&sort=name',
    );
    organizations.lists[0]?.answer.next(directoryOf());
    commercial.lists[0]?.answer.next(commercialListOf());
    expect(facade.rows().map((r) => r.organization.id)).toEqual([RIAD, HORIZON]);
    facade.setQuery({ requests: false, subscription: 'ending' });
    await settle();
    expect(router.url).toBe('/platforms/school/organizations?subscription=ending&sort=name');
    expect(facade.rows().map((r) => r.organization.id)).toEqual([RIAD]);
    expect(organizations.lists).toHaveLength(1);
  });

  it('leaves the subscription filter off while the owner’s commercial facts are unavailable', async () => {
    const { facade, organizations, commercial } = await setUp(
      owner,
      '/platforms/school/organizations?subscription=none',
    );
    organizations.lists[0]?.answer.next(directoryOf());
    commercial.lists[0]?.answer.error({ kind: 'unavailable', status: 503 });
    expect(facade.subscriptionFilterAvailable()).toBe(false);
    expect(facade.rows()).toHaveLength(3);
    facade.reloadCommercial();
    expect(commercial.lists).toHaveLength(2);
    expect(organizations.lists).toHaveLength(1);
  });
});
