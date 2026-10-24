import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, Routes, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import { Actor } from '../../core/auth/actor';
import { AuthSession } from '../../core/auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../../core/config/app-environment';
import { EntityLabel } from '../../core/context/entity-label';
import { ScopeContext } from '../../core/context/scope-context';
import { DEMO_COMPANY_ID, DEMO_SCHOOL_PLATFORM_ID } from '../../demo/world/seed';
import { ScopeDirectoryGateway } from '../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../core/context/scope-directory.mock';
import { platformId } from '../../core/context/scope.model';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA, Breadcrumbs } from './breadcrumbs';

const DEMO: DemoBindings = {
  signIn: {
    accounts: [],
    password: 'p',
    code: 'c',
    operators: [],
    workingCode: 'w',
    newOperators: [],
    confirmationCode: 'k',
  },
  providers: {
    auth: [],
    scopeDirectory: [],
    notificationSummary: [],
    platformDirectory: [],
    companyOverview: [],
    commercialSummary: [],
    licenses: [],
    billing: [],
    activity: [],
    services: [],
    releases: [],
    companySettings: [],
    platformDashboard: [],
    platformCommercial: [],
    organizations: [],
    organizationCommercial: [],
    platformCommands: [],
    organizationCommands: [],
    adminInvitations: [],
    memberships: [],
    operators: [],
    stepUp: [],
  },
};

@Component({ template: '' })
class Blank {}

async function render(
  actor: Actor,
  url?: string,
  routes: Routes = [{ path: '**', component: Blank }],
) {
  TestBed.configureTestingModule({
    imports: [
      Breadcrumbs,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter(routes),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      ScopeContext,
      EntityLabel,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  if (url) await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(Breadcrumbs);
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

const crumbs = (nav: HTMLElement) =>
  [...nav.querySelectorAll('.breadcrumbs__item:not(:first-child)')].map((li) => ({
    text: li.textContent?.replace(/\s+/g, ' ').trim(),
    href: li.querySelector('a')?.getAttribute('href') ?? null,
  }));

const OWNER: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};

describe('Breadcrumbs', () => {
  it('shows a company-scope page below its parent page, linked (an operator, never by contact)', async () => {
    const nav = await render(OWNER, '/operators/some-id', [
      {
        path: 'operators/:operatorId',
        component: Blank,
        data: {
          [BREADCRUMB_DATA]: 'shell.breadcrumb.operator',
          [BREADCRUMB_PARENT_DATA]: { key: 'shell.breadcrumb.operators', link: '/operators' },
        },
      },
    ]);
    expect(crumbs(nav)).toEqual([
      { text: en.shell.breadcrumb.company, href: '/overview' },
      { text: en.shell.breadcrumb.operators, href: '/operators' },
      { text: en.shell.breadcrumb.operator, href: null },
    ]);
  });

  it('shows an owner the Company, linked to the overview', async () => {
    const nav = await render({
      kind: 'owner',
      userId: 'o',
      email: 'owner@x.invalid',
      companyId: DEMO_COMPANY_ID,
    });
    expect(nav.querySelector('.breadcrumbs__home')?.getAttribute('href')).toBe('/overview');
    expect(nav.querySelector('.breadcrumbs__home')?.getAttribute('aria-label')).toBe(
      en.shell.breadcrumb.home,
    );
    expect(nav.textContent).toContain(en.shell.breadcrumb.company);
  });

  it('never implies company-wide scope to an operator', async () => {
    const nav = await render({
      kind: 'operator',
      userId: 'p',
      email: null,
      phone: '+99900000001',
      platformAssignments: [platformId('school')],
    });
    const home = nav.querySelector('.breadcrumbs__home');
    expect(home?.getAttribute('href')).toBe('/platforms/school');
    expect(home?.getAttribute('aria-label')).toBe(en.shell.context.assigned);
    expect(nav.textContent).toContain(en.shell.context.assigned);
    expect(nav.textContent).not.toContain(en.shell.breadcrumb.company);
    expect(nav.querySelector('a[href="/overview"]')).toBeNull();
  });

  it('continues through a Platform’s Organizations, linking every level above the current page', async () => {
    const school = `/platforms/${DEMO_SCHOOL_PLATFORM_ID}`;
    const nav = await render(OWNER, `${school}/organizations?sort=name`);
    expect(crumbs(nav)).toEqual([
      { text: en.shell.breadcrumb.company, href: '/overview' },
      { text: en.shell.breadcrumb.platforms, href: '/platforms' },
      { text: 'Nawara School', href: school },
      { text: en.shell.breadcrumb.organizations, href: null },
    ]);
  });

  it('names the Organization only once its page says so, and only for that page', async () => {
    const school = `/platforms/${DEMO_SCHOOL_PLATFORM_ID}`;
    const nav = await render(OWNER, `${school}/organizations/riad`);
    const last = () => crumbs(nav).at(-1)?.text;
    expect(last()).toBe(en.shell.breadcrumb.organization);
    expect(crumbs(nav).at(-2)).toEqual({
      text: en.shell.breadcrumb.organizations,
      href: `${school}/organizations`,
    });
    const label = TestBed.inject(EntityLabel);
    label.set(`${school}/organizations/riad`, 'Collège Riad');
    await TestBed.inject(Router).navigateByUrl(`${school}/organizations/riad`);
    TestBed.tick();
    expect(last()).toBe('Collège Riad');
    // Another Organization's page never shows a stale name.
    await TestBed.inject(Router).navigateByUrl(`${school}/organizations/horizon`);
    TestBed.tick();
    expect(last()).toBe(en.shell.breadcrumb.organization);
    // Nor after a sign-out.
    await TestBed.inject(Router).navigateByUrl(`${school}/organizations/riad`);
    TestBed.inject(AuthSession).signOut();
    TestBed.tick();
    expect(last()).not.toBe('Collège Riad');
  });

  it('continues to an Organization’s members and one membership, naming the Organization, never a member', async () => {
    const school = `/platforms/${DEMO_SCHOOL_PLATFORM_ID}`;
    const members = `${school}/organizations/riad/members`;
    const nav = await render(OWNER, `${members}?status=pending`);
    const label = TestBed.inject(EntityLabel);
    label.set(members, 'Collège Riad');
    TestBed.tick();
    expect(crumbs(nav).slice(-3)).toEqual([
      { text: en.shell.breadcrumb.organizations, href: `${school}/organizations` },
      { text: 'Collège Riad', href: `${school}/organizations/riad` },
      { text: en.shell.breadcrumb.members, href: null },
    ]);
    await TestBed.inject(Router).navigateByUrl(`${members}/m-1`);
    label.set(`${members}/m-1`, 'Collège Riad');
    TestBed.tick();
    expect(crumbs(nav).slice(-3)).toEqual([
      { text: 'Collège Riad', href: `${school}/organizations/riad` },
      { text: en.shell.breadcrumb.members, href: members },
      { text: en.shell.breadcrumb.membership, href: null },
    ]);
  });
});
