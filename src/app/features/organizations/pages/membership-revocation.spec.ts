import { Dialog } from '@angular/cdk/dialog';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import en from '../../../../i18n/en.json';
import { ScopeContext, membershipPath } from '../../../core/context/scope-context';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { DemoWorld } from '../../../demo/world/demo-world';
import { MembershipRecord } from '../../../demo/world/records';
import { DEMO_DRIVE_PLATFORM_ID, DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { MembershipDecisionAction } from '../application/membership-decision.action';
import { MembershipRevokeAction } from '../application/membership-revoke.action';
import { MembershipGateway } from '../data-access/membership.gateway';
import {
  MEMBERSHIP_DECISIONS_DEMO_SCENARIO,
  MembershipDecisionsDemoScenario,
} from '../data-access/membership.mock';
import {
  HORIZON,
  MEMBERS,
  SCHOOL,
  operatorOf,
  owner,
  renderMembers,
  text,
} from '../testing/members-testing';
import { MembershipDetailPage } from './membership-detail.page';
import { OrganizationMembersPage } from './organization-members.page';

const R = en.organizations.members.revoke;
const strip = (s: string) => s.replace(/[⁨⁩]/g, '');

async function setUp({
  actor = owner,
  identity = DEMO_OWNER_ID,
  scenario = 'normal' as MembershipDecisionsDemoScenario,
  latency = 0,
  url = MEMBERS,
  detail = false,
  memberships = 'mock' as 'mock' | 'unavailable',
} = {}) {
  const page: Type<unknown> = detail ? MembershipDetailPage : OrganizationMembersPage;
  const rendered = await renderMembers(page, actor, identity, url, {
    memberships,
    extraProviders: [
      { provide: MEMBERSHIP_DECISIONS_DEMO_SCENARIO, useValue: scenario },
      { provide: DEMO_LATENCY_MS, useValue: latency },
    ],
  });
  const { element, settle } = rendered;
  for (let i = 0; i < 20 && !element.querySelector('.member-list, .membership-detail__card'); i++)
    await settle(latency + 10);
  const world = TestBed.inject(DemoWorld);
  const dialog = () => document.querySelector<HTMLElement>('adm-revoke-membership-dialog');
  /** The table's controls (the cards' twins are hidden by the container query in a browser, not in jsdom). */
  const revokes = () =>
    [...element.querySelectorAll<HTMLButtonElement>('[data-revoke]')].filter(
      (b) => b.closest('.member-list__cards') === null,
    );
  const button = (label: string, root: ParentNode | null = dialog()) =>
    [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) =>
      text(b).startsWith(label),
    ) ?? null;
  const press = async (label: string, wait = latency + 10) => {
    const b = button(label);
    if (!b) throw new Error(`no button ${label}`);
    b.click();
    await settle(wait);
  };
  const horizon = (status: MembershipRecord['status']) =>
    world.snapshot().memberships.filter((m) => m.organizationId === HORIZON && m.status === status);
  /** The table row's membership id of a Revoke control. */
  const idOf = (b: HTMLElement) =>
    b.closest('tr')?.querySelector('a')?.getAttribute('href')?.split('/').at(-1) ?? '';
  /** The Revoke control of the row of an organization admin (or not). */
  const revokeFor = (admin: boolean) =>
    revokes().find(
      (b) => (b.closest('tr')?.querySelector('.member-list__admin') !== null) === admin,
    )!;
  return {
    ...rendered,
    world,
    revoke: vi.spyOn(TestBed.inject(MembershipGateway), 'revoke'),
    revision: TestBed.inject(ScopeContext).revision,
    toasts: vi.spyOn(TestBed.inject(NwToastService), 'show'),
    action: TestBed.inject(MembershipRevokeAction),
    decisions: TestBed.inject(MembershipDecisionAction),
    dialog,
    role: () => document.querySelector('.cdk-dialog-container')?.getAttribute('role') ?? null,
    revokes,
    revokeFor,
    idOf,
    button,
    press,
    horizon,
    record: (id: string) => world.snapshot().memberships.find((m) => m.id === id),
    tabCounts: () => rendered.tabs().map((t) => text(t)),
  };
}

// These page tests render the real demo world (École Horizon's 64 active rows, as a table and as cards, each with its
// membership controls): about a second each on their own, several under the full parallel suite. The timeout covers
// that rendering cost only; every assertion is unchanged.
describe('Membership revocation (P5-S3a)', { timeout: 15_000 }, () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('offers Revoke on active rows only, named with the member, with the owner’s authority line', async () => {
    const s = await setUp();
    expect(s.revokes().length).toBe(s.rows().length);
    const first = s.revokes()[0]!;
    expect(strip(first.getAttribute('aria-label') ?? '')).toContain(
      R.for.replace('{{who}}', '').trim(),
    );
    expect(text(s.element)).toContain(R.authorityOwner);
    await s.router.navigateByUrl(`${MEMBERS}?status=pending`);
    await s.settle(10);
    expect(s.element.querySelectorAll('[data-revoke]')).toHaveLength(0);
  });

  it('confirms in an alertdialog that starts on Cancel and says what is and is not affected; no verification', async () => {
    const s = await setUp();
    s.revokeFor(false).click();
    await s.settle();
    expect(s.role()).toBe('alertdialog');
    expect(document.activeElement?.hasAttribute('data-cancel')).toBe(true);
    const body = strip(text(s.dialog()));
    expect(body).toContain(R.body.replace('{{name}}', 'École Horizon'));
    for (const line of [R.keptAccount, R.keptOther, R.keptCommercial, R.noRestore])
      expect(body).toContain(line);
    expect(body).not.toContain(R.adminTitle);
    expect(s.dialog()?.querySelector('input[name="step-up-code"]')).toBeNull();
  });

  it('revokes from the list: one membership leaves Active, counts refresh, focus moves to the next row', async () => {
    const s = await setUp();
    const before = s.revision();
    const target = s.revokeFor(false);
    const id = s.idOf(target);
    target.click();
    await s.settle();
    await s.press(R.confirm, 20);
    expect(s.revoke).toHaveBeenCalledTimes(1);
    expect(s.revoke).toHaveBeenCalledWith(HORIZON, id);
    expect(s.record(id)).toMatchObject({ status: 'revoked', isOrganizationAdmin: false });
    expect(s.revision()).toBeGreaterThan(before);
    await s.settle(10);
    expect(s.tabCounts()).toEqual(['Active 63', 'Requests 3', 'Rejected 1']);
    expect(s.rows().some((r) => r.querySelector('a')?.getAttribute('href')?.endsWith(id))).toBe(
      false,
    );
    const message = strip(String(s.toasts.mock.calls[0]?.[0]));
    expect(message).toBe(R.revoked.replace('{{name}}', 'École Horizon'));
    expect(message).not.toContain('@');
    expect(document.activeElement?.hasAttribute('data-revoke')).toBe(true);
  });

  it('warns that an admin also loses the role; an operator is told only the owner grants it again', async () => {
    let s = await setUp();
    s.revokeFor(true).click();
    await s.settle();
    let body = strip(text(s.dialog()));
    expect(body).toContain(R.adminTitle);
    expect(body).not.toContain(R.adminOperator);
    TestBed.inject(Dialog).closeAll();
    TestBed.resetTestingModule();

    s = await setUp({
      actor: operatorOf(DEMO_OPERATOR_IDS.school),
      identity: DEMO_OPERATOR_IDS.school,
    });
    expect(strip(text(s.element))).toContain(
      R.authorityOperator.replace('{{platform}}', 'Nawara School'),
    );
    const admin = s.revokeFor(true);
    const id = s.idOf(admin);
    admin.click();
    await s.settle();
    body = strip(text(s.dialog()));
    expect(body).toContain(R.adminTitle);
    expect(body).toContain(R.adminOperator);
    await s.press(R.confirm, 20);
    expect(s.record(id)).toMatchObject({ status: 'revoked', isOrganizationAdmin: false });
  });

  it('holds every membership control while a revocation is sent; double clicks send once', async () => {
    const s = await setUp({ latency: 60 });
    s.revokes()[0]!.click();
    await s.settle();
    const confirm = s.button(R.confirm)!;
    confirm.click();
    confirm.click();
    await s.settle();
    expect(text(s.dialog())).toContain(R.revoking);
    expect(s.revoke).toHaveBeenCalledTimes(1);
    expect(s.decisions.sending()).toBe(true);
    const others = s.revokes();
    expect(others.every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    others[0]!.click();
    await s.settle();
    expect(document.querySelectorAll('adm-revoke-membership-dialog')).toHaveLength(1);
    await s.settle(200);
    expect(s.revoke).toHaveBeenCalledTimes(1);
    expect(s.horizon('active')).toHaveLength(63);
  });

  it('never resends after a lost answer; it says the membership may have been revoked, never that it was', async () => {
    const s = await setUp({ scenario: 'outcomeUnknown' });
    const target = s.revokeFor(false);
    const id = s.idOf(target);
    target.click();
    await s.settle();
    await s.press(R.confirm, 30);
    expect(text(s.dialog())).toContain(R.failure.unknown);
    await s.settle(20);
    expect(text(s.dialog())).toContain(R.notListed);
    expect(s.button(en.actions.retry)).toBeNull();
    await s.press(en.organizations.members.decision.checkStatus, 20);
    expect(s.revoke).toHaveBeenCalledTimes(1);
    expect(s.record(id)?.status).toBe('revoked');
  });

  it('reports a competing revocation (409) and offers no retry', async () => {
    const s = await setUp({ scenario: 'decidedElsewhere' });
    s.revokeFor(false).click();
    await s.settle();
    await s.press(R.confirm, 30);
    expect(text(s.dialog())).toContain(R.failure.notActive);
    await s.settle(20);
    expect(text(s.dialog())).toContain(R.notListed);
    expect(s.button(en.actions.retry)).toBeNull();
  });

  it('offers "Try again" where Core refused before applying anything', async () => {
    const s = await setUp({ scenario: 'rateLimited' });
    s.revokes()[0]!.click();
    await s.settle();
    await s.press(R.confirm, 20);
    expect(text(s.dialog())).toContain(R.failure.rateLimited);
    await s.press(en.actions.retry, 20);
    expect(s.revoke).toHaveBeenCalledTimes(2);
    expect(s.horizon('active')).toHaveLength(64);
  });

  it('revokes from a membership’s details and returns to the members list, focusing its count', async () => {
    const target = (await setUp()).horizon('active').find((m) => !m.isOrganizationAdmin)!;
    TestBed.resetTestingModule();
    const s = await setUp({ url: membershipPath(SCHOOL, HORIZON, target.id), detail: true });
    expect(text(s.element)).toContain(R.cardTitle);
    s.element.querySelector<HTMLButtonElement>('[data-revoke]')!.click();
    await s.settle();
    await s.press(R.confirm, 20);
    await s.settle(20);
    expect(s.router.url).toBe(MEMBERS);
    expect(s.record(target.id)?.status).toBe('revoked');
    expect(s.action.returnedFromDetails()).toBe(true);
  });

  it('offers nothing to an operator of another Platform or in a build without the adapter, and never on one’s own membership', async () => {
    let s = await setUp({
      actor: operatorOf(DEMO_OPERATOR_IDS.phone, [DEMO_DRIVE_PLATFORM_ID]),
      identity: DEMO_OPERATOR_IDS.phone,
    });
    expect(s.element.querySelectorAll('[data-revoke]')).toHaveLength(0);
    expect(s.revoke).not.toHaveBeenCalled();
    const member = s.horizon('active')[0]!;
    TestBed.resetTestingModule();
    s = await setUp();
    const listed = {
      id: member.id,
      userId: member.userId,
      status: 'active' as const,
      requestedAt: member.requestedAt,
      approvedAt: member.approvedAt,
      rejectedAt: null,
      isOrganizationAdmin: false,
      email: null,
      phone: null,
      audience: 'student',
      contactVerified: true,
    };
    expect(s.action.offers(listed)).toBe(true);
    expect(s.action.offers({ ...listed, userId: owner.userId })).toBe(false);
    expect(s.action.offers({ ...listed, status: 'pending' })).toBe(false);
    TestBed.resetTestingModule();
    s = await setUp({ memberships: 'unavailable' });
    expect(s.action.offers(listed)).toBe(false);
    expect(s.element.querySelectorAll('[data-revoke]')).toHaveLength(0);
  });
});
