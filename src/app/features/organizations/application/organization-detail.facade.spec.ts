import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { NEVER, of } from 'rxjs';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import {
  Blank,
  DEMO,
  DRIVE,
  HORIZON,
  PLATFORMS,
  RIAD,
  SCHOOL,
  ScriptedCommercial,
  ScriptedDirectory,
  ScriptedOrganizations,
  commercialOf,
  detailOf,
  operator,
  owner,
} from '../testing/organizations-testing';
import { OrganizationDetailFacade } from './organization-detail.facade';

async function setUp(actor: Actor, url = '/platforms/school/organizations/riad') {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: 'platforms/:platformId/organizations/:organizationId', component: Blank },
        { path: 'platforms/:platformId', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: ScopeDirectoryGateway, useClass: ScriptedDirectory },
      { provide: OrganizationGateway, useClass: ScriptedOrganizations },
      { provide: OrganizationCommercialGateway, useClass: ScriptedCommercial },
      ScopeContext,
      OrganizationDetailFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const facade = TestBed.inject(OrganizationDetailFacade);
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

describe('OrganizationDetailFacade', () => {
  afterEach(() => {
    ScriptedDirectory.answer = () => of(PLATFORMS);
  });

  it('confirms the Platform before asking anything about the Organization', async () => {
    ScriptedDirectory.answer = () => NEVER;
    const { facade, organizations, commercial } = await setUp(owner);
    expect(facade.view()).toEqual({ status: 'checking' });
    expect(organizations.loads).toHaveLength(0);
    expect(commercial.loads).toHaveLength(0);
  });

  it('loads the owner’s Organization, then (only once it is shown) its commercial facts', async () => {
    const { facade, organizations, commercial } = await setUp(owner);
    expect(organizations.loads.map((r) => r.key)).toEqual([RIAD]);
    expect(commercial.loads).toHaveLength(0);
    organizations.loads[0]?.answer.next(detailOf());
    await settle();
    expect(facade.view()).toMatchObject({ status: 'ready', platform: PLATFORMS[0] });
    expect(commercial.loads.map((r) => r.key)).toEqual([RIAD]);
    commercial.loads[0]?.answer.next(commercialOf());
    expect(facade.commercial().status).toBe('success');
  });

  it('never asks an operator’s commercial facts', async () => {
    const { facade, organizations, commercial } = await setUp(operator);
    organizations.loads[0]?.answer.next({
      ...detailOf(),
      adminInvitationsAwaiting: { status: 'unavailable' },
      activity: { status: 'unavailable' },
    });
    await settle();
    expect(facade.view().status).toBe('ready');
    expect(facade.showsCommercial()).toBe(false);
    expect(facade.showsActivity()).toBe(false);
    expect(commercial.loads).toHaveLength(0);
    expect(facade.commercial()).toEqual({ status: 'idle' });
  });

  it('collapses an Organization of another Platform, an unknown one and a refusal into “not found”', async () => {
    const { facade, organizations, commercial } = await setUp(owner);
    organizations.loads[0]?.answer.next(detailOf(RIAD, DRIVE));
    await settle();
    expect(facade.view()).toEqual({ status: 'notFound', platform: PLATFORMS[0] });
    expect(commercial.loads).toHaveLength(0);
    facade.reload();
    organizations.loads[1]?.answer.error({ kind: 'not_found', status: 404 });
    expect(facade.view().status).toBe('notFound');
    facade.reload();
    organizations.loads[2]?.answer.error({ kind: 'forbidden', status: 403 });
    expect(facade.view().status).toBe('notFound');
  });

  it('tells an outage and a build without the contract apart from a refusal', async () => {
    const { facade, organizations } = await setUp(owner);
    organizations.loads[0]?.answer.error({ kind: 'unavailable', status: 503 });
    expect(facade.view()).toEqual({ status: 'error', platform: PLATFORMS[0] });
    facade.reload();
    organizations.loads[1]?.answer.error(adapterUnavailable());
    expect(facade.view()).toEqual({ status: 'notInBuild', platform: PLATFORMS[0] });
  });

  it('collapses an operator’s Platform outside their scope before asking anything', async () => {
    const { facade, organizations } = await setUp(operator, '/platforms/drive/organizations/riad');
    expect(facade.view()).toEqual({ status: 'notAccessible' });
    expect(organizations.loads).toHaveLength(0);
  });

  it('cancels stale loads on a switch, and shows a late answer for the previous Organization as loading', async () => {
    const { facade, organizations, commercial, router } = await setUp(owner);
    const first = organizations.loads[0];
    await router.navigateByUrl('/platforms/school/organizations/horizon');
    await settle();
    expect(first?.live()).toBe(false);
    expect(organizations.loads.map((r) => r.key)).toEqual([RIAD, HORIZON]);
    organizations.loads[1]?.answer.next(detailOf(RIAD));
    expect(facade.view().status).toBe('loading');
    organizations.loads[1]?.answer.next(detailOf(HORIZON));
    await settle();
    expect(facade.view()).toMatchObject({ status: 'ready', detail: { id: HORIZON } });
    commercial.loads[0]?.answer.next(commercialOf(RIAD));
    expect(facade.commercial().status).toBe('loading');
  });

  it('drops everything when the URL leaves the Platform the actor may see', async () => {
    const { facade, organizations, router } = await setUp(owner);
    const first = organizations.loads[0];
    await router.navigateByUrl('/platforms/unknown');
    await settle();
    expect(first?.live()).toBe(false);
    expect(facade.view()).toEqual({ status: 'notAccessible' });
    expect(SCHOOL).not.toBe(DRIVE);
  });
});
