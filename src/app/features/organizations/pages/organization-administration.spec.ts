import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { EntityLabel } from '../../../core/context/entity-label';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { organizationId } from '../../../core/context/scope.model';
import { DemoWorld } from '../../../demo/world/demo-world';
import {
  activeMembershipCount,
  financialAttentionOf,
  subscriptionLifecycleOf,
} from '../../../demo/world/selectors';
import {
  DEMO_COMPANY_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import {
  ORGANIZATION_COMMANDS_DEMO_SCENARIO,
  OrganizationCommandsDemoScenario,
} from '../data-access/organization-command.mock';
import { OrganizationGateway } from '../data-access/organization.gateway';
import {
  MockOrganizationCommercialGateway,
  MockOrganizationGateway,
} from '../data-access/organization.mock';
import { OrganizationDetailPage } from './organization-detail.page';
import { organizationActionTestProviders } from '../testing/organization-actions-testing';
import { Blank, DEMO } from '../testing/organizations-testing';
import { OrganizationDetailFacade } from '../application/organization-detail.facade';
import { MembershipActionLock } from '../application/membership-action-support';
import { MembershipDecisionAction } from '../application/membership-decision.action';
import { MembershipRevokeAction } from '../application/membership-revoke.action';
import { OrganizationAdminRoleAction } from '../application/organization-admin-role.action';
import { OrganizationMembersFacade } from '../application/organization-members.facade';
import { MembershipGateway, UnavailableMembershipGateway } from '../data-access/membership.gateway';
import { MockMembershipGateway } from '../data-access/membership.mock';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';

const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;
const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
const DETAIL = `/platforms/${SCHOOL}/organizations/${HORIZON}`;
const NOW = Date.parse('2026-10-23T12:00:00Z');

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'o@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.school,
  email: 'p@x.invalid',
  platformAssignments: [SCHOOL],
};

async function render(
  actor: Actor,
  {
    latency = 0,
    scenario = 'normal' as OrganizationCommandsDemoScenario,
    memberships = 'unavailable' as 'unavailable' | 'mock',
  } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      OrganizationDetailPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'platforms/:platformId/organizations/:organizationId', component: Blank },
        { path: 'platforms/:platformId/organizations', component: Blank },
        { path: 'platforms/:platformId', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: latency },
      { provide: NW_CLOCK, useValue: () => Date.parse('2026-10-23T12:00:00Z') },
      { provide: ORGANIZATION_COMMANDS_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      { provide: OrganizationGateway, useClass: MockOrganizationGateway },
      { provide: OrganizationCommercialGateway, useClass: MockOrganizationCommercialGateway },
      ScopeContext,
      EntityLabel,
      OrganizationDetailFacade,
      ...organizationActionTestProviders(true),
      // The detail page embeds the members page (PR #89): the detail route's members providers, with
      // the Membership gateway unavailable (the members list is not under test here).
      {
        provide: MembershipGateway,
        useClass: memberships === 'mock' ? MockMembershipGateway : UnavailableMembershipGateway,
      },
      OrganizationMembersFacade,
      MembershipActionLock,
      MembershipDecisionAction,
      MembershipRevokeAction,
      OrganizationAdminRoleAction,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.kind === 'owner' ? DEMO_OWNER_ID : DEMO_OPERATOR_IDS.school,
  });
  const world = TestBed.inject(DemoWorld);
  // Horizon has a phone and a type to start from.
  world.commit((tables) => ({
    ok: true,
    result: null,
    world: {
      ...tables,
      organizations: tables.organizations.map((o) =>
        o.id === HORIZON ? { ...o, phone: '+213 21 00 00', type: 'School' } : o,
      ),
    },
  }));
  const router = TestBed.inject(Router);
  await router.navigateByUrl(DETAIL);
  const fixture = TestBed.createComponent(OrganizationDetailPage);
  const settle = async (ms = 5) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  const page = fixture.nativeElement as HTMLElement;
  for (let i = 0; i < 30 && !page.querySelector('h1 bdi'); i++) await settle(2 * latency + 10);
  return { page, settle, world, router };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
const editDialog = () => document.querySelector<HTMLElement>('adm-edit-organization-dialog');
const panel = () => document.querySelector<HTMLElement>('adm-organization-details-panel');
const field = (name: string) =>
  editDialog()?.querySelector<HTMLInputElement>(`[name="organization-${name}"]`) ?? null;
const buttonIn = (root: HTMLElement | null, label: string) =>
  [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) =>
    text(b).startsWith(label),
  ) ?? null;

/** The current UI path (PR #89): "Overview" opens the details side panel, whose "Edit details" opens the editor. */
async function openEditor(page: HTMLElement, settle: (ms?: number) => Promise<void>) {
  buttonIn(page, en.organizations.detail.overview)!.click();
  await settle();
  const edit = buttonIn(panel(), en.organizations.edit.open);
  if (!edit) throw new Error('no Edit details in the details panel');
  edit.click();
  await settle();
  if (!editDialog()) throw new Error('the editor did not open');
}

async function type(settle: (ms?: number) => Promise<void>, name: string, value: string) {
  const input = field(name);
  if (!input) throw new Error(`no ${name}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
  await settle();
}

describe('Organization administration through the current UI (WP-4.3)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('the owner edits from the details panel: the page, the panel, the directory and the record agree', async () => {
    const { page, settle, world } = await render(owner);
    const before = world.snapshot().organizations.find((o) => o.id === HORIZON)!;
    await openEditor(page, settle);
    expect(field('name')?.value).toBe('École Horizon');
    await type(settle, 'name', 'École Horizon – Annexe');
    await type(settle, 'phone', '');
    buttonIn(editDialog(), en.organizations.edit.save)!.click();
    await settle(20);
    const after = world.snapshot().organizations.find((o) => o.id === HORIZON)!;
    // Only the changed fields change; identity, Platform, creation and every other field are kept.
    expect(after).toEqual({
      ...before,
      name: 'École Horizon – Annexe',
      phone: null,
      updatedAt: after.updatedAt,
    });
    expect(text(page.querySelector('h1'))).toBe('École Horizon – Annexe');
    // The panel reads the same shared record.
    expect(text(panel())).toContain('École Horizon – Annexe');
    // The directory reads the same shared record.
    const directory = await firstValueFrom(TestBed.inject(OrganizationGateway).list(SCHOOL));
    expect(directory.organizations.find((o) => o.id === HORIZON)?.name).toBe(
      'École Horizon – Annexe',
    );
  });

  it('keeps memberships, the subscription and the financial cases exactly as they were', async () => {
    const { page, settle, world } = await render(owner);
    const before = world.snapshot();
    const lifecycle = subscriptionLifecycleOf(before, HORIZON, NOW);
    const attention = financialAttentionOf(before, before.organizations);
    await openEditor(page, settle);
    await type(settle, 'name', 'Renamed');
    buttonIn(editDialog(), en.organizations.edit.save)!.click();
    await settle(20);
    const after = world.snapshot();
    for (const table of [
      'memberships',
      'members',
      'adminInvitations',
      'subscriptions',
      'invoices',
      'paymentRequests',
      'reconciliationCases',
      'paymentDisputes',
      'refundCases',
    ] as const)
      expect(after[table], table).toBe(before[table]);
    expect(subscriptionLifecycleOf(after, HORIZON, NOW)).toEqual(lifecycle);
    expect(financialAttentionOf(after, after.organizations)).toEqual(attention);
    expect(activeMembershipCount(after, HORIZON)).toBe(activeMembershipCount(before, HORIZON));
  });

  it('refuses a blank name in the editor, and the record stays as it was', async () => {
    const { page, settle, world } = await render(owner);
    const before = world.snapshot();
    await openEditor(page, settle);
    await type(settle, 'name', '   ');
    buttonIn(editDialog(), en.organizations.edit.save)!.click();
    await settle(20);
    expect(text(editDialog())).toContain(en.organizations.edit.nameRequired);
    expect(world.snapshot()).toBe(before);
  });

  it('a refusal or an unavailable service changes nothing and never shows a success', async () => {
    for (const scenario of ['notAuthoritative', 'unavailable'] as const) {
      TestBed.resetTestingModule();
      const { page, settle, world } = await render(owner, { scenario });
      const before = world.snapshot();
      await openEditor(page, settle);
      await type(settle, 'name', 'Never saved');
      buttonIn(editDialog(), en.organizations.edit.save)!.click();
      await settle(20);
      expect(world.snapshot(), scenario).toBe(before);
      expect(text(page.querySelector('h1')), scenario).toBe('École Horizon');
      TestBed.inject(Dialog).closeAll();
    }
  });

  it('an operator assigned to the Platform edits too; the panel offers no other management action', async () => {
    const { page, settle, world } = await render(operator);
    buttonIn(page, en.organizations.detail.overview)!.click();
    await settle();
    const actions = [...(panel()?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
      .map((b) => text(b))
      .filter((label) => label.length > 0);
    // Tabs, close and "Edit details" only: no delete, suspend, transfer or financial action.
    for (const label of actions)
      expect(label, label).not.toMatch(/delete|suspend|archive|transfer|refund|resolve|override/i);
    expect(actions).toContain(en.organizations.edit.open);
    buttonIn(panel(), en.organizations.edit.open)!.click();
    await settle();
    await type(settle, 'type', 'Lycée');
    buttonIn(editDialog(), en.organizations.edit.save)!.click();
    await settle(20);
    expect(world.snapshot().organizations.find((o) => o.id === HORIZON)?.type).toBe('Lycée');
  });
});

describe('Administrator invitations through the current UI (WP-4.3)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());
  const I = en.organizations.invitations;
  const invitationDialog = () =>
    document.querySelector<HTMLElement>('adm-create-admin-invitation-dialog');
  const invitationField = (name: string) =>
    invitationDialog()?.querySelector<HTMLInputElement>(`[name="${name}"]`) ?? null;
  const fill = async (settle: (ms?: number) => Promise<void>, name: string, value: string) => {
    const input = invitationField(name)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };

  it('"Invitations" offers Create and Manage; Manage lists every invitation, with Revoke on active ones only', async () => {
    const { page, settle, world } = await render(owner);
    const before = world.snapshot();
    buttonIn(page, I.view)!.click();
    await settle(20);
    const tabs = [...(invitationDialog()?.querySelectorAll('[role="tab"]') ?? [])].map((t) =>
      text(t),
    );
    expect(tabs).toEqual([I.create.open, I.manageTab]);
    invitationDialog()!.querySelector<HTMLButtonElement>('#invitation-tab-manage')!.click();
    await settle(20);
    const items = [...(invitationDialog()?.querySelectorAll('.admin-invitations__item') ?? [])];
    expect(items).toHaveLength(
      before.adminInvitations.filter((i) => i.organizationId === HORIZON).length,
    );
    const revocable = items.filter((li) => li.querySelector('.admin-invitations__revoke'));
    expect(revocable.length).toBeGreaterThan(0);
    expect(revocable.every((li) => text(li).startsWith('Active'))).toBe(true);
    // Looking changes nothing.
    expect(world.snapshot()).toBe(before);
  });

  it('a verified creation adds exactly one invitation, and the detail summary counts it', async () => {
    const { page, settle, world } = await render(owner);
    const count = () =>
      Number(text(page.querySelector('[aria-describedby="summary-invitations"]')));
    const awaiting = count();
    const before = world.snapshot();
    buttonIn(page, I.view)!.click();
    await settle(20);
    await fill(settle, 'invitation-type', 'org_admin');
    buttonIn(invitationDialog(), I.create.continue)!.click();
    await settle();
    await fill(settle, 'step-up-code', '123456');
    buttonIn(invitationDialog(), I.create.verifyAndCreate)!.click();
    await settle(30);
    const after = world.snapshot();
    expect(after.adminInvitations).toHaveLength(before.adminInvitations.length + 1);
    // Nothing else of the world moved: the Organization, its memberships, subscription and financial facts.
    for (const table of [
      'organizations',
      'memberships',
      'subscriptions',
      'paymentRequests',
      'reconciliationCases',
    ] as const)
      expect(after[table], table).toBe(before[table]);
    TestBed.inject(Dialog).closeAll();
    await settle(20);
    expect(count()).toBe(awaiting + 1);
  });

  it('an operator gets no invitations entry (Core refuses operators)', async () => {
    const { page } = await render(operator);
    expect(buttonIn(page, I.view)).toBeNull();
    expect(page.querySelector('[aria-describedby="summary-invitations"]')).toBeNull();
  });
});

describe('Membership decisions through the current UI (WP-4.3)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());
  const D = en.organizations.members.decision;

  it('the detail page’s pending count lists the requests; approving one moves it to Active and updates the counts', async () => {
    const { page, settle, world } = await render(owner, { memberships: 'mock' });
    const pending = () =>
      world
        .snapshot()
        .memberships.filter((m) => m.organizationId === HORIZON && m.status === 'pending');
    const active = () =>
      world
        .snapshot()
        .memberships.filter((m) => m.organizationId === HORIZON && m.status === 'active');
    const before = { pending: pending().length, active: active().length };
    expect(before.pending).toBeGreaterThan(0);
    page.querySelector<HTMLButtonElement>('[aria-describedby="summary-requests"]')!.click();
    await settle(30);
    const approve = [...page.querySelectorAll<HTMLButtonElement>('[data-decide="approve"]')].filter(
      (b) => b.closest('.member-list__cards') === null,
    );
    expect(approve.length).toBe(before.pending);
    const stepUp = vi.spyOn(TestBed.inject(StepUpGateway), 'obtain');
    approve[0]!.click();
    await settle(10);
    const dialog = document.querySelector<HTMLElement>('adm-membership-decision-dialog');
    buttonIn(dialog, D.approveConfirm)!.click();
    await settle(30);
    expect(pending()).toHaveLength(before.pending - 1);
    expect(active()).toHaveLength(before.active + 1);
    // A decision needs no verification (P5-S2).
    expect(stepUp).not.toHaveBeenCalled();
    expect(text(page.querySelector('[aria-describedby="summary-memberships"]'))).toBe(
      String(before.active + 1),
    );
    expect(text(page.querySelector('[aria-describedby="summary-requests"]'))).toBe(
      String(before.pending - 1),
    );
  });
});
