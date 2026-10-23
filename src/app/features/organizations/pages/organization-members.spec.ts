import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { EntityLabel } from '../../../core/context/entity-label';
import { ScopeContext, membersPath, membershipPath } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { organizationId } from '../../../core/context/scope.model';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { OrganizationDetailFacade } from '../application/organization-detail.facade';
import { OrganizationMembersFacade } from '../application/organization-members.facade';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import {
  MockOrganizationCommercialGateway,
  MockOrganizationGateway,
} from '../data-access/organization.mock';
import { MembershipGateway, UnavailableMembershipGateway } from '../data-access/membership.gateway';
import { MockMembershipGateway } from '../data-access/membership.mock';
import { Blank, DEMO } from '../testing/organizations-testing';
import { MembershipDetailPage } from './membership-detail.page';
import { OrganizationMembersPage } from './organization-members.page';

const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;
const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
const ANDALOUS = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c24');
const MEMBERS = membersPath(SCHOOL, HORIZON);

const owner: Actor = {
  kind: 'owner',
  userId: 'owner-user',
  email: 'o@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operatorOf = (id: AdminIdentityId, assignments = [SCHOOL]): Actor => ({
  kind: 'operator',
  userId: `user-${id}`,
  email: 'p@x.invalid',
  platformAssignments: assignments,
});

async function render<T>(
  page: Type<T>,
  actor: Actor,
  identity: AdminIdentityId,
  url: string,
  { memberships = 'mock' as 'mock' | 'unavailable' } = {},
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

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';

describe('OrganizationMembersPage (demo world)', () => {
  it('shows Active by default with each tab’s count, the admin badge in words, and email or phone identities', async () => {
    const { element, tabs, rows, label } = await render(
      OrganizationMembersPage,
      owner,
      DEMO_OWNER_ID,
      MEMBERS,
    );
    expect(tabs().map(text)).toEqual(['Active 64', 'Requests 3', 'Rejected 1']);
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true');
    expect(rows()).toHaveLength(64);
    expect(text(element.querySelector('.organization-members__count'))).toBe('Showing 64 of 64');
    const identities = rows().map((r) => text(r.querySelector('.member-list__link')));
    expect(identities.every((t) => /^member-\d{4}@example\.invalid$|^\+999\d{9}$/.test(t))).toBe(
      true,
    );
    expect(element.querySelectorAll('.member-list__table .member-list__admin')).toHaveLength(1);
    // The breadcrumb label is the Organization's name, never a contact.
    expect(label.labelFor(MEMBERS)).toBe('École Horizon');
    // Cards exist for narrow widths, the same rows.
    expect(element.querySelectorAll('.member-list__card')).toHaveLength(64);
  });

  it('keeps the search out of the URL; the admins filter and the sort go into it', async () => {
    const { element, router, settle, rows } = await render(
      OrganizationMembersPage,
      owner,
      DEMO_OWNER_ID,
      MEMBERS,
    );
    const search = element.querySelector<HTMLInputElement>('.organization-members__search-input')!;
    search.value = 'member-000';
    search.dispatchEvent(new Event('input'));
    await settle();
    expect(rows().length).toBeLessThan(64);
    expect(router.url).toBe(MEMBERS);
    element.querySelector<HTMLInputElement>('.organization-members__check input')!.click();
    await settle();
    expect(router.url).toContain('admins=1');
    const select = element.querySelector<HTMLSelectElement>('.organization-members__sort select')!;
    select.value = 'identity';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(router.url).toContain('sort=identity');
    expect(router.url).not.toContain('member-000');
  });

  it('moves between tabs with the arrow keys, Home and End, loading nothing new', async () => {
    const { router, settle, tabs, rows, listSpy } = await render(
      OrganizationMembersPage,
      owner,
      DEMO_OWNER_ID,
      MEMBERS,
    );
    const calls = listSpy.mock.calls.length;
    tabs()[0]!.focus();
    tabs()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(router.url).toContain('status=pending');
    expect(document.activeElement).toBe(tabs()[1]);
    expect(rows()).toHaveLength(3);
    tabs()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await settle();
    expect(router.url).toContain('status=rejected');
    expect(rows()).toHaveLength(1);
    tabs()[2]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    await settle();
    expect(router.url).toBe(MEMBERS);
    expect(listSpy.mock.calls.length).toBe(calls);
    // Exactly Core's three statuses were asked, each explicitly.
    expect(listSpy.mock.calls.map((c) => c[1]).sort()).toEqual(['active', 'pending', 'rejected']);
  });

  it('lets an assigned operator read the members; an unassigned one gets the not-accessible state and no request', async () => {
    const assigned = await render(
      OrganizationMembersPage,
      operatorOf(DEMO_OPERATOR_IDS.school),
      DEMO_OPERATOR_IDS.school,
      MEMBERS,
    );
    expect(assigned.rows()).toHaveLength(64);
    TestBed.resetTestingModule();
    const other = await render(
      OrganizationMembersPage,
      operatorOf(DEMO_OPERATOR_IDS.phone, [DEMO_DRIVE_PLATFORM_ID]),
      DEMO_OPERATOR_IDS.phone,
      MEMBERS,
    );
    expect(text(other.element.querySelector('h1'))).toBe(
      en.organizations.states.notAccessibleTitle,
    );
    expect(other.listSpy).not.toHaveBeenCalled();
  });

  it('says members are not available in a build without the gateway', async () => {
    const { element } = await render(OrganizationMembersPage, owner, DEMO_OWNER_ID, MEMBERS, {
      memberships: 'unavailable',
    });
    expect(text(element)).toContain(en.organizations.members.notInBuildTitle);
  });
});

describe('MembershipDetailPage (resolved from the lists)', () => {
  it('shows a membership from the Organization’s lists, with only Core’s fields', async () => {
    const seed = TestBed.inject(DemoWorld).snapshot();
    const pending = seed.memberships.find(
      (m) => m.organizationId === HORIZON && m.status === 'pending',
    )!;
    TestBed.resetTestingModule();
    const { element, label } = await render(
      MembershipDetailPage,
      owner,
      DEMO_OWNER_ID,
      membershipPath(SCHOOL, HORIZON, pending.id),
    );
    expect(text(element.querySelector('h1'))).toMatch(
      /^member-\d{4}@example\.invalid$|^\+999\d{9}$/,
    );
    expect(text(element)).toContain(en.organizations.members.detail.statusPending);
    expect(text(element)).toContain(en.organizations.members.detail.otherNote);
    expect(label.labelFor(membershipPath(SCHOOL, HORIZON, pending.id))).toBe('École Horizon');
  });

  it('treats another Organization’s membership, a revoked one and an unknown id alike: not found', async () => {
    const seed = TestBed.inject(DemoWorld).snapshot();
    const elsewhere = seed.memberships.find((m) => m.organizationId === ANDALOUS)!;
    const revoked = seed.memberships.find(
      (m) => m.organizationId === HORIZON && m.status === 'revoked',
    )!;
    for (const id of [elsewhere.id, revoked.id, 'unknown']) {
      TestBed.resetTestingModule();
      const { element } = await render(
        MembershipDetailPage,
        owner,
        DEMO_OWNER_ID,
        membershipPath(SCHOOL, HORIZON, id),
      );
      expect(text(element.querySelector('h1'))).toBe(en.organizations.members.detail.notFoundTitle);
    }
  });
});
