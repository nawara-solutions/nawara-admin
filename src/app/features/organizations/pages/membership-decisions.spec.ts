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
import { MembershipGateway } from '../data-access/membership.gateway';
import {
  MEMBERSHIP_DECISIONS_DEMO_SCENARIO,
  MembershipDecisionsDemoScenario,
} from '../data-access/membership.mock';
import { Membership } from '../domain/membership.model';
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

const D = en.organizations.members.decision;
const strip = (s: string) => s.replace(/[⁨⁩]/g, '');

async function setUp({
  actor = owner,
  identity = DEMO_OWNER_ID,
  scenario = 'normal' as MembershipDecisionsDemoScenario,
  latency = 0,
  url = `${MEMBERS}?status=pending`,
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
  const dialog = () => document.querySelector<HTMLElement>('adm-membership-decision-dialog');
  /** The table's controls (the cards' twins are hidden by the container query in a browser, not in jsdom). */
  const controls = (kind: 'approve' | 'reject') =>
    [...element.querySelectorAll<HTMLButtonElement>(`[data-decide="${kind}"]`)].filter(
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
    world
      .snapshot()
      .memberships.filter((m) => m.organizationId === HORIZON && m.status === status)
      .sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt));
  const emailOf = (m: MembershipRecord) =>
    world.snapshot().members.find((p) => p.id === m.userId)?.email ?? null;
  return {
    ...rendered,
    world,
    decide: vi.spyOn(TestBed.inject(MembershipGateway), 'decide'),
    revision: TestBed.inject(ScopeContext).revision,
    toasts: vi.spyOn(TestBed.inject(NwToastService), 'show'),
    action: TestBed.inject(MembershipDecisionAction),
    dialog,
    role: () => document.querySelector('.cdk-dialog-container')?.getAttribute('role') ?? null,
    controls,
    button,
    press,
    horizon,
    emailOf,
    tabCounts: () => rendered.tabs().map((t) => text(t)),
  };
}

// These page tests render the real demo world (École Horizon's 64 active rows, as a table and as cards, each with its
// membership controls): about a second each on their own, several under the full parallel suite. The timeout covers
// that rendering cost only; every assertion is unchanged.
describe('Membership decisions (P5-S2)', { timeout: 15_000 }, () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('offers Approve and Reject on each request, named with its member, and nothing on Active rows', async () => {
    const s = await setUp();
    expect(s.rows()).toHaveLength(3);
    expect(s.rows().every((r) => text(r).includes('teacher'))).toBe(true);
    // The table lists newest first by default; the labels carry each identity.
    const labels = s.controls('approve').map((b) => strip(b.getAttribute('aria-label') ?? ''));
    for (const m of s.horizon('pending')) {
      const who = s.emailOf(m) ?? s.world.snapshot().members.find((p) => p.id === m.userId)!.phone!;
      expect(labels).toContain(D.approveFor.replace('{{who}}', who));
    }
    expect(text(s.element)).toContain(D.authorityOwner);
    await s.router.navigateByUrl(MEMBERS);
    await s.settle(10);
    expect(s.element.querySelectorAll('[data-decide]')).toHaveLength(0);
  });

  it('approves after a confirmation: one request becomes active, counts and every view refresh, focus moves on', async () => {
    const s = await setUp();
    const before = s.revision();
    const rows = s.rows();
    const target = s.controls('approve')[0]!;
    const id = rows[0]!.querySelector('a')!.getAttribute('href')!.split('/').at(-1)!;
    target.click();
    await s.settle();
    expect(s.role()).toBe('dialog');
    expect(document.activeElement?.hasAttribute('data-confirm')).toBe(true);
    expect(strip(text(s.dialog()))).toContain(D.approveBody.replace('{{name}}', 'École Horizon'));
    expect(text(s.dialog())).toContain(D.approveNote);
    await s.press(D.approveConfirm, 20);
    expect(s.decide).toHaveBeenCalledTimes(1);
    expect(s.decide).toHaveBeenCalledWith(HORIZON, id, 'approve');
    expect(s.world.snapshot().memberships.find((m) => m.id === id)?.status).toBe('active');
    expect(s.revision()).toBeGreaterThan(before);
    expect(s.dialog()).toBeNull();
    await s.settle(10);
    expect(s.tabCounts()).toEqual(['Active 65', 'Requests 2', 'Rejected 1']);
    expect(s.rows()).toHaveLength(2);
    const message = strip(String(s.toasts.mock.calls[0]?.[0]));
    expect(message).toBe(D.approved.replace('{{name}}', 'École Horizon'));
    expect(message).not.toContain('@');
    // The next request's "Approve" (in jsdom the cards are the displayed list: no container queries).
    expect(document.activeElement?.getAttribute('data-decide')).toBe('approve');
    expect(document.activeElement?.closest('li, tr')).toBe(
      document.activeElement?.closest('ul, tbody')?.firstElementChild,
    );
  });

  it('rejects in an alertdialog that starts on Cancel; the request moves to Rejected', async () => {
    const s = await setUp();
    s.controls('reject')[1]!.click();
    await s.settle();
    expect(s.role()).toBe('alertdialog');
    expect(document.activeElement?.hasAttribute('data-cancel')).toBe(true);
    expect(strip(text(s.dialog()))).toContain(D.rejectBody.replace('{{name}}', 'École Horizon'));
    await s.press(D.rejectConfirm, 20);
    await s.settle(10);
    expect(s.tabCounts()).toEqual(['Active 64', 'Requests 2', 'Rejected 2']);
    expect(s.horizon('pending')).toHaveLength(2);
    expect(s.decide).toHaveBeenCalledTimes(1);
  });

  it('sends one decision at a time: double clicks and other rows wait while it is pending', async () => {
    const s = await setUp({ latency: 60 });
    s.controls('approve')[0]!.click();
    await s.settle();
    const confirm = s.button(D.approveConfirm)!;
    confirm.click();
    confirm.click();
    await s.settle();
    expect(text(s.dialog())).toContain(D.approving);
    expect(s.decide).toHaveBeenCalledTimes(1);
    const others = s.controls('approve');
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    others[0]!.click();
    await s.settle();
    expect(document.querySelectorAll('adm-membership-decision-dialog')).toHaveLength(1);
    await s.settle(200);
    expect(s.decide).toHaveBeenCalledTimes(1);
    expect(s.horizon('active')).toHaveLength(65);
  });

  it('never resends after a lost answer: it reloads and shows where the request is now', async () => {
    const s = await setUp({ scenario: 'outcomeUnknown' });
    const id = s.horizon('pending').at(-1)!.id;
    s.controls('approve')[0]!.click();
    await s.settle();
    await s.press(D.approveConfirm, 30);
    expect(text(s.dialog())).toContain(D.failure.unknown);
    await s.settle(20);
    expect(text(s.dialog())).toContain(`${D.nowStatus} ${en.organizations.members.status.active}`);
    expect(s.button(en.actions.retry)).toBeNull();
    await s.press(D.checkStatus, 20);
    expect(s.decide).toHaveBeenCalledTimes(1);
    expect(s.world.snapshot().memberships.find((m) => m.id === id)?.status).toBe('active');
  });

  it('reports a competing decision (409) with the request’s current status, and offers no retry', async () => {
    const s = await setUp({ scenario: 'decidedElsewhere' });
    s.controls('reject')[0]!.click();
    await s.settle();
    await s.press(D.rejectConfirm, 30);
    expect(text(s.dialog())).toContain(D.failure.alreadyDecided);
    await s.settle(20);
    expect(text(s.dialog())).toContain(`${D.nowStatus} ${en.organizations.members.status.active}`);
    expect(s.button(en.actions.retry)).toBeNull();
    expect(s.horizon('rejected')).toHaveLength(1);
  });

  it('offers "Try again" only where Core refused before applying anything', async () => {
    const s = await setUp({ scenario: 'rateLimited' });
    s.controls('approve')[0]!.click();
    await s.settle();
    await s.press(D.approveConfirm, 20);
    expect(text(s.dialog())).toContain(D.failure.rateLimited);
    await s.press(en.actions.retry, 20);
    expect(s.decide).toHaveBeenCalledTimes(2);
    expect(s.horizon('pending')).toHaveLength(3);
  });

  it('lets an assigned operator decide; an operator of another Platform sees no request and sends nothing', async () => {
    let s = await setUp({
      actor: operatorOf(DEMO_OPERATOR_IDS.school),
      identity: DEMO_OPERATOR_IDS.school,
    });
    expect(strip(text(s.element))).toContain(
      D.authorityOperator.replace('{{platform}}', 'Nawara School'),
    );
    s.controls('approve')[0]!.click();
    await s.settle();
    await s.press(D.approveConfirm, 20);
    expect(s.horizon('active')).toHaveLength(65);
    TestBed.inject(Dialog).closeAll();
    TestBed.resetTestingModule();

    s = await setUp({
      actor: operatorOf(DEMO_OPERATOR_IDS.phone, [DEMO_DRIVE_PLATFORM_ID]),
      identity: DEMO_OPERATOR_IDS.phone,
    });
    expect(s.element.querySelectorAll('[data-decide]')).toHaveLength(0);
    expect(s.decide).not.toHaveBeenCalled();
    expect(s.horizon('pending')).toHaveLength(3);
  });

  it('decides from a pending membership’s details and stays there, focusing its facts', async () => {
    const request = (await setUp()).horizon('pending')[0]!;
    TestBed.resetTestingModule();
    const s = await setUp({ url: membershipPath(SCHOOL, HORIZON, request.id), detail: true });
    expect(text(s.element)).toContain(D.cardTitle);
    s.element.querySelector<HTMLButtonElement>('[data-decide="approve"]')!.click();
    await s.settle();
    await s.press(D.approveConfirm, 20);
    await s.settle(20);
    expect(text(s.element.querySelector('nw-status-badge'))).toBe(
      en.organizations.members.status.active,
    );
    expect(s.element.querySelector('[data-decide]')).toBeNull();
    expect(document.activeElement?.id).toBe('membership-detail-facts');
  });

  it('offers a decision whatever the audience, never on one’s own or a decided membership, and never without an adapter', async () => {
    const s = await setUp();
    const listed: Membership = {
      id: 'm',
      userId: 'someone',
      status: 'pending',
      requestedAt: '2026-10-23T08:00:00Z',
      approvedAt: null,
      rejectedAt: null,
      isOrganizationAdmin: false,
      email: null,
      phone: null,
      audience: 'teacher',
      contactVerified: true,
    };
    for (const audience of ['teacher', 'student', 'learner', 'anything'])
      expect(s.action.offers({ ...listed, audience })).toBe(true);
    expect(s.action.offers({ ...listed, userId: owner.userId })).toBe(false);
    expect(s.action.offers({ ...listed, status: 'active' })).toBe(false);
    expect(s.action.offers({ ...listed, status: 'rejected' })).toBe(false);
    TestBed.resetTestingModule();
    const none = await setUp({ memberships: 'unavailable' });
    expect(none.action.offers(listed)).toBe(false);
    expect(none.element.querySelectorAll('[data-decide]')).toHaveLength(0);
  });
});
