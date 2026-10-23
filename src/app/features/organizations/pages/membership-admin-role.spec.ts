import { Dialog } from '@angular/cdk/dialog';
import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import en from '../../../../i18n/en.json';
import { ScopeContext, membershipPath } from '../../../core/context/scope-context';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { DemoWorld } from '../../../demo/world/demo-world';
import { MembershipRecord } from '../../../demo/world/records';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
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

const ROLE = en.organizations.members.role;
const strip = (s: string) => s.replace(/[⁨⁩]/g, '');

async function setUp({
  actor = owner,
  identity = DEMO_OWNER_ID,
  scenario = 'normal' as MembershipDecisionsDemoScenario,
  latency = 0,
  url = MEMBERS,
  detail = false,
} = {}) {
  const page: Type<unknown> = detail ? MembershipDetailPage : OrganizationMembersPage;
  const rendered = await renderMembers(page, actor, identity, url, {
    extraProviders: [
      { provide: MEMBERSHIP_DECISIONS_DEMO_SCENARIO, useValue: scenario },
      { provide: DEMO_LATENCY_MS, useValue: latency },
    ],
  });
  const { element, settle } = rendered;
  for (let i = 0; i < 20 && !element.querySelector('.member-list, .membership-detail__card'); i++)
    await settle(latency + 10);
  const world = TestBed.inject(DemoWorld);
  const dialog = () => document.querySelector<HTMLElement>('adm-organization-admin-role-dialog');
  /** The table's "Actions" buttons (the cards' twins are hidden by the container query in a browser, not jsdom). */
  const triggers = () =>
    [...element.querySelectorAll<HTMLButtonElement>('[data-actions]')].filter(
      (b) => b.closest('.member-list__cards') === null,
    );
  const triggerOf = (id: string) => triggers().find((b) => b.dataset['membership'] === id)!;
  const menuItems = () =>
    [...document.querySelectorAll<HTMLButtonElement>('.nw-menu button')].map((b) => text(b));
  /** Opens a row's menu and chooses its role change. */
  const openRole = async (id: string) => {
    triggerOf(id).click();
    await settle();
    document.querySelector<HTMLButtonElement>('.nw-menu [data-role]')!.click();
    await settle();
  };
  const button = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) =>
      text(b).startsWith(label),
    ) ?? null;
  const press = async (label: string, wait = latency + 10) => {
    const b = button(label);
    if (!b) throw new Error(`no button ${label}`);
    b.click();
    await settle(wait);
  };
  /** Types a code into the verification field and submits it. */
  const verify = async (code: string, wait = latency + 20) => {
    const input = dialog()!.querySelector<HTMLInputElement>('input[name="step-up-code"]')!;
    input.value = code;
    input.dispatchEvent(new Event('input'));
    await settle();
    dialog()!.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await settle(wait);
  };
  const horizon = (pick: (m: MembershipRecord) => boolean) =>
    world.snapshot().memberships.filter((m) => m.organizationId === HORIZON && pick(m));
  return {
    ...rendered,
    world,
    set: vi.spyOn(TestBed.inject(MembershipGateway), 'setOrganizationAdmin'),
    revision: TestBed.inject(ScopeContext).revision,
    toasts: vi.spyOn(TestBed.inject(NwToastService), 'show'),
    dialog,
    role: () => document.querySelector('.cdk-dialog-container')?.getAttribute('role') ?? null,
    triggers,
    triggerOf,
    menuItems,
    openRole,
    button,
    press,
    verify,
    horizon,
    member: () => horizon((m) => m.status === 'active' && !m.isOrganizationAdmin)[0]!,
    admin: () => horizon((m) => m.status === 'active' && m.isOrganizationAdmin)[0]!,
    record: (id: string) => world.snapshot().memberships.find((m) => m.id === id),
    tabCounts: () => rendered.tabs().map((t) => text(t)),
  };
}

// These page tests render the real demo world (École Horizon's 64 active rows, as a table and as cards, each with its
// membership controls): about a second each on their own, several under the full parallel suite. The timeout covers
// that rendering cost only; every assertion is unchanged.
describe('Organization-admin role (P5-S3b)', { timeout: 15_000 }, () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('gives the owner one "Actions" menu per active row: the role change that applies, then Revoke', async () => {
    const s = await setUp();
    expect(s.triggers()).toHaveLength(64);
    s.triggerOf(s.member().id).click();
    await s.settle();
    expect(s.menuItems()).toEqual([ROLE.grantOpen, en.organizations.members.revoke.menuItem]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await s.settle();
    s.triggerOf(s.admin().id).click();
    await s.settle();
    expect(s.menuItems()[0]).toBe(ROLE.removeOpen);
  });

  it('never offers the role to an operator, in the list or on the details page', async () => {
    let s = await setUp({
      actor: operatorOf(DEMO_OPERATOR_IDS.school),
      identity: DEMO_OPERATOR_IDS.school,
    });
    expect(s.element.querySelectorAll('[data-actions], [data-role]')).toHaveLength(0);
    expect(s.element.querySelectorAll('[data-revoke]').length).toBeGreaterThan(0);
    const admin = s.admin();
    TestBed.resetTestingModule();
    s = await setUp({
      actor: operatorOf(DEMO_OPERATOR_IDS.school),
      identity: DEMO_OPERATOR_IDS.school,
      url: membershipPath(SCHOOL, HORIZON, admin.id),
      detail: true,
    });
    expect(s.element.querySelector('[data-role]')).toBeNull();
    expect(s.element.querySelector('[data-revoke]')).not.toBeNull();
    expect(s.set).not.toHaveBeenCalled();
  });

  it('grants after a confirmation and the owner’s verification; a wrong code stays in verification', async () => {
    const s = await setUp();
    const member = s.member();
    const before = s.revision();
    await s.openRole(member.id);
    expect(s.role()).toBe('dialog');
    expect(document.activeElement?.hasAttribute('data-confirm')).toBe(true);
    const body = strip(text(s.dialog()));
    expect(body).toContain(ROLE.grantBody.replace('{{name}}', 'École Horizon'));
    for (const line of [ROLE.grantKeepsMembership, ROLE.grantNoOtherAccess, ROLE.grantNoCommercial])
      expect(body).toContain(line);
    await s.press(ROLE.continue);
    expect(document.activeElement?.getAttribute('name')).toBe('step-up-code');
    expect(text(s.dialog())).toContain(ROLE.grantPurpose.replace('{{name}}', 'École Horizon'));
    await s.verify('000000');
    expect(s.dialog()?.querySelector('input[name="step-up-code"]')).not.toBeNull();
    expect(text(s.dialog())).toContain(en.actions.failure.verificationRefused);
    expect(s.set).not.toHaveBeenCalled();
    await s.verify('123456', 30);
    expect(s.set).toHaveBeenCalledTimes(1);
    expect(s.set.mock.calls[0]?.slice(0, 3)).toEqual([HORIZON, member.id, true]);
    expect(s.record(member.id)).toMatchObject({ status: 'active', isOrganizationAdmin: true });
    expect(s.revision()).toBeGreaterThan(before);
    await s.settle(20);
    expect(s.tabCounts()).toEqual(['Active 64', 'Requests 3', 'Rejected 1']);
    expect(
      s.triggerOf(member.id).closest('tr')?.querySelector('.member-list__admin'),
    ).not.toBeNull();
    const message = strip(String(s.toasts.mock.calls[0]?.[0]));
    expect(message).toBe(ROLE.granted.replace('{{name}}', 'École Horizon'));
    expect(message).not.toContain('@');
    expect(document.activeElement?.getAttribute('data-membership')).toBe(member.id);
  });

  it('warns about an unverified contact when granting, without blocking it', async () => {
    const s = await setUp();
    const unverified = s
      .horizon((m) => m.status === 'active' && !m.isOrganizationAdmin)
      .find((m) => !s.world.snapshot().members.find((p) => p.id === m.userId)?.contactVerified)!;
    await s.openRole(unverified.id);
    expect(text(s.dialog())).toContain(ROLE.unverifiedWarning);
    await s.press(ROLE.continue);
    await s.verify('123456', 30);
    expect(s.record(unverified.id)?.isOrganizationAdmin).toBe(true);
  });

  it('removes the last listed admin after an alertdialog warning, never blocked', async () => {
    const s = await setUp();
    const admin = s.admin();
    await s.openRole(admin.id);
    expect(s.role()).toBe('alertdialog');
    expect(document.activeElement?.hasAttribute('data-cancel')).toBe(true);
    const body = strip(text(s.dialog()));
    expect(body).toContain(ROLE.removeBody.replace('{{name}}', 'École Horizon'));
    expect(body).toContain(ROLE.lastAdminTitle);
    await s.press(ROLE.continue);
    expect(text(s.dialog())).toContain(ROLE.removePurpose.replace('{{name}}', 'École Horizon'));
    await s.verify('123456', 30);
    expect(s.record(admin.id)).toMatchObject({ status: 'active', isOrganizationAdmin: false });
    expect(s.horizon((m) => m.isOrganizationAdmin)).toHaveLength(0);
    await s.settle(20);
    expect(s.tabCounts()[0]).toBe('Active 64');
  });

  it('never resends after a lost answer: it reloads and says what the list shows', async () => {
    const s = await setUp({ scenario: 'outcomeUnknown' });
    const member = s.member();
    await s.openRole(member.id);
    await s.press(ROLE.continue);
    await s.verify('123456', 40);
    expect(text(s.dialog())).toContain(ROLE.failure.unknown);
    await s.settle(20);
    expect(text(s.dialog())).toContain(ROLE.nowAdmin);
    expect(s.button(en.actions.retry)).toBeNull();
    await s.press(en.organizations.members.decision.checkStatus, 20);
    expect(s.set).toHaveBeenCalledTimes(1);
  });

  it('reports a competing change (404) with the role the reload shows, and offers no retry', async () => {
    const s = await setUp({ scenario: 'decidedElsewhere' });
    await s.openRole(s.member().id);
    await s.press(ROLE.continue);
    await s.verify('123456', 40);
    expect(text(s.dialog())).toContain(ROLE.failure.notApplied);
    await s.settle(20);
    expect(text(s.dialog())).toContain(ROLE.nowAdmin);
    expect(s.button(en.actions.retry)).toBeNull();
  });

  it('after a refusal before anything was applied, "Try again" asks for a new verification', async () => {
    const s = await setUp({ scenario: 'rateLimited' });
    const member = s.member();
    await s.openRole(member.id);
    await s.press(ROLE.continue);
    await s.verify('123456', 30);
    expect(text(s.dialog())).toContain(ROLE.failure.rateLimited);
    await s.press(en.actions.retry);
    expect(s.dialog()?.querySelector('input[name="step-up-code"]')).not.toBeNull();
    expect(s.set).toHaveBeenCalledTimes(1);
    expect(s.record(member.id)?.isOrganizationAdmin).toBe(false);
  });

  it('holds every membership control while a role change is sent', async () => {
    // A wide in-flight window (400 ms for the step-up, 400 ms for the change of simulated latency), so the checks below run while the request is pending
    // even under the full suite's load.
    const s = await setUp({ latency: 400 });
    await s.openRole(s.member().id);
    await s.press(ROLE.continue, 70);
    const input = s.dialog()!.querySelector<HTMLInputElement>('input[name="step-up-code"]')!;
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    await s.settle();
    s.dialog()!.querySelector<HTMLFormElement>('form')!.requestSubmit();
    // The step-up answers after 400 ms; the change is then pending for 400 ms more.
    await s.settle(500);
    expect(text(s.dialog())).toContain(ROLE.granting);
    expect(s.triggers().every((b) => b.getAttribute('aria-disabled') === 'true')).toBe(true);
    await s.settle(600);
    expect(s.set).toHaveBeenCalledTimes(1);
  });

  it('changes the role from a membership’s details and stays there, focusing its facts', async () => {
    const member = (await setUp()).member();
    TestBed.resetTestingModule();
    const s = await setUp({ url: membershipPath(SCHOOL, HORIZON, member.id), detail: true });
    expect(text(s.element)).toContain(ROLE.sectionTitle);
    s.element.querySelector<HTMLButtonElement>('[data-role]')!.click();
    await s.settle();
    await s.press(ROLE.continue);
    await s.verify('123456', 30);
    await s.settle(20);
    expect(s.record(member.id)?.isOrganizationAdmin).toBe(true);
    expect(text(s.element.querySelector('.membership-detail__admin'))).toBe(
      en.organizations.members.role.admin,
    );
    expect(document.activeElement?.id).toBe('membership-detail-facts');
    expect(s.router.url).toBe(membershipPath(SCHOOL, HORIZON, member.id));
  });
});
