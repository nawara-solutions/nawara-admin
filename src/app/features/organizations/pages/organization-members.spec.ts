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

/** Opens a members popup ("Filters" or "Sort"), chooses an option and applies it. */
async function choose(
  element: HTMLElement,
  settle: (ms?: number) => Promise<void>,
  opener: string,
  value: string,
) {
  [...element.querySelectorAll<HTMLButtonElement>('button')]
    .find((b) => text(b).startsWith(opener))
    ?.click();
  await settle();
  const dialog = document.querySelector('adm-member-filter-dialog');
  dialog?.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)?.click();
  await settle();
  [...(dialog?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    .find((b) => text(b) === en.operators.filters.apply)
    ?.click();
  await settle();
}

// These page tests render the real demo world (École Horizon's 64 active rows, as a table and as cards, each with its
// membership controls): about a second each on their own, several under the full parallel suite. The timeout covers
// that rendering cost only; every assertion is unchanged.
describe('OrganizationMembersPage (demo world)', { timeout: 15_000 }, () => {
  it('shows Active by default, the admin badge in words, and email or phone identities', async () => {
    const { element, rows, label, world } = await render(
      OrganizationMembersPage,
      owner,
      DEMO_OWNER_ID,
      MEMBERS,
    );
    // PR #89: no status tabs; the URL's status (Active by default) comes from the Organization page's counts.
    expect(rows()).toHaveLength(64);
    expect(
      world
        .snapshot()
        .memberships.filter((m) => m.organizationId === HORIZON && m.status === 'active'),
    ).toHaveLength(64);
    expect(text(element.querySelector('.organization-members__count'))).toBe('Showing 64 of 64');
    const identities = rows().map((r) => text(r.querySelector('.member-list__link')));
    expect(identities.every((t) => /^member-\d{4}@example\.invalid$|^\+999\d{9}$/.test(t))).toBe(
      true,
    );
    // The role in words is on the cards (PR #89's table shows it to the owner through the role action only).
    expect(element.querySelectorAll('.member-list__cards .member-list__admin')).toHaveLength(1);
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
    // PR #89: the admins filter and the sort are chosen in the Filters and Sort popups, then applied.
    await choose(element, settle, en.operators.filters.title, 'true');
    expect(router.url).toContain('admins=1');
    await choose(element, settle, en.organizations.toolbar.sort, 'identity');
    expect(router.url).toContain('sort=identity');
    expect(router.url).not.toContain('member-000');
  });

  it('moves between statuses from the URL (PR #89: the Organization page’s counts), loading nothing new', async () => {
    const { router, settle, rows, listSpy } = await render(
      OrganizationMembersPage,
      owner,
      DEMO_OWNER_ID,
      MEMBERS,
    );
    const calls = listSpy.mock.calls.length;
    await router.navigateByUrl(`${MEMBERS}?status=pending`);
    await settle();
    expect(rows()).toHaveLength(3);
    await router.navigateByUrl(`${MEMBERS}?status=rejected`);
    await settle();
    expect(rows()).toHaveLength(1);
    await router.navigateByUrl(MEMBERS);
    await settle();
    expect(rows()).toHaveLength(64);
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
