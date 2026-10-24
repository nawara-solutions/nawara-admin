import { TestBed } from '@angular/core/testing';
import en from '../../../../i18n/en.json';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DEMO_DRIVE_PLATFORM_ID, DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { membershipPath } from '../../../core/context/scope-context';
import {
  ANDALOUS,
  HORIZON,
  MEMBERS,
  SCHOOL,
  operatorOf,
  owner,
  renderMembers as render,
  text,
} from '../testing/members-testing';
import { MembershipDetailPage } from './membership-detail.page';
import { OrganizationMembersPage } from './organization-members.page';

// These page tests render the real demo world (École Horizon's 64 active rows, as a table and as cards, each with its
// membership controls): about a second each on their own, several under the full parallel suite. The timeout covers
// that rendering cost only; every assertion is unchanged.
describe('OrganizationMembersPage (demo world)', { timeout: 15_000 }, () => {
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

describe('MembershipDetailPage (resolved from the lists)', { timeout: 15_000 }, () => {
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
