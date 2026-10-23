import { Provider, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { EntityLabel } from '../../../core/context/entity-label';
import { ScopeContext, membersPath } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { organizationId } from '../../../core/context/scope.model';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import { DEMO_COMPANY_ID, DEMO_SCHOOL_PLATFORM_ID } from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { OrganizationDetailFacade } from '../application/organization-detail.facade';
import { MembershipDecisionAction } from '../application/membership-decision.action';
import { OrganizationMembersFacade } from '../application/organization-members.facade';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import {
  MockOrganizationCommercialGateway,
  MockOrganizationGateway,
} from '../data-access/organization.mock';
import { MembershipGateway, UnavailableMembershipGateway } from '../data-access/membership.gateway';
import { MockMembershipGateway } from '../data-access/membership.mock';
import { Blank, DEMO } from './organizations-testing';

/** The members pages under test (P5-S1, P5-S2): the demo world, the Organization's facades and the decision action. */
export const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;
export const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
export const ANDALOUS = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c24');
export const MEMBERS = membersPath(SCHOOL, HORIZON);

export const owner: Actor = {
  kind: 'owner',
  userId: 'owner-user',
  email: 'o@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
export const operatorOf = (id: AdminIdentityId, assignments = [SCHOOL]): Actor => ({
  kind: 'operator',
  userId: `user-${id}`,
  email: 'p@x.invalid',
  platformAssignments: assignments,
});

export async function renderMembers<T>(
  page: Type<T>,
  actor: Actor,
  identity: AdminIdentityId,
  url: string,
  { memberships = 'mock' as 'mock' | 'unavailable', extraProviders = [] as Provider[] } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      page,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        {
          path: 'platforms/:platformId/organizations/:organizationId/members/:membershipId',
          component: Blank,
        },
        { path: 'platforms/:platformId/organizations/:organizationId/members', component: Blank },
        { path: 'platforms/:platformId/organizations/:organizationId', component: Blank },
        { path: 'platforms/:platformId/organizations', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => Date.parse('2026-10-23T12:00:00Z') },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      { provide: OrganizationGateway, useClass: MockOrganizationGateway },
      { provide: OrganizationCommercialGateway, useClass: MockOrganizationCommercialGateway },
      {
        provide: MembershipGateway,
        useClass: memberships === 'mock' ? MockMembershipGateway : UnavailableMembershipGateway,
      },
      ScopeContext,
      EntityLabel,
      OrganizationDetailFacade,
      OrganizationMembersFacade,
      MembershipDecisionAction,
      ...extraProviders,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: identity,
  });
  const listSpy = vi.spyOn(TestBed.inject(MembershipGateway), 'list');
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(page);
  const settle = async (ms = 5) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  const element = fixture.nativeElement as HTMLElement;
  for (let i = 0; i < 20 && !element.querySelector('h1'); i++) await settle(10);
  await settle(10);
  const tabs = () => [...element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const rows = () => [...element.querySelectorAll('.member-list__table tbody tr')];
  return {
    element,
    router,
    settle,
    tabs,
    rows,
    listSpy,
    world: TestBed.inject(DemoWorld),
    label: TestBed.inject(EntityLabel),
  };
}

export const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
