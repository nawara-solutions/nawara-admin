import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
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
  DEMO_COMPANY_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_OWNER_USER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { AdminInvitationGateway } from '../data-access/admin-invitation.gateway';
import {
  ADMIN_INVITATIONS_DEMO_SCENARIO,
  AdminInvitationsDemoScenario,
} from '../data-access/admin-invitation.mock';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import {
  MockOrganizationCommercialGateway,
  MockOrganizationGateway,
} from '../data-access/organization.mock';
import { OrganizationDetailPage } from '../pages/organization-detail.page';
import { organizationActionTestProviders } from '../testing/organization-actions-testing';
import { Blank, DEMO } from '../testing/organizations-testing';
import { OrganizationDetailFacade } from './organization-detail.facade';

const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;
const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
const DETAIL = `/platforms/${SCHOOL}/organizations/${HORIZON}`;
const CODE = /[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/;

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_USER_ID,
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
  { latency = 0, scenario = 'normal' as AdminInvitationsDemoScenario } = {},
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
      { provide: ADMIN_INVITATIONS_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      { provide: OrganizationGateway, useClass: MockOrganizationGateway },
      { provide: OrganizationCommercialGateway, useClass: MockOrganizationCommercialGateway },
      ScopeContext,
      EntityLabel,
      OrganizationDetailFacade,
      ...organizationActionTestProviders(true),
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.kind === 'owner' ? DEMO_OWNER_ID : DEMO_OPERATOR_IDS.school,
  });
  const gateway = TestBed.inject(AdminInvitationGateway);
  const listSpy = vi.spyOn(gateway, 'list');
  await TestBed.inject(Router).navigateByUrl(DETAIL);
  const fixture = TestBed.createComponent(OrganizationDetailPage);
  const settle = async (ms = 5) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  const page = fixture.nativeElement as HTMLElement;
  const card = () => page.querySelector<HTMLElement>('adm-admin-invitations-card');
  const items = () => [...(card()?.querySelectorAll('.admin-invitations__item') ?? [])];
  for (let i = 0; i < 30 && items().length === 0; i++) await settle(2 * latency + 10);
  const dialog = () =>
    document.querySelector<HTMLElement>(
      'adm-create-admin-invitation-dialog, adm-revoke-admin-invitation-dialog',
    );
  const field = (name: string) =>
    dialog()?.querySelector<HTMLInputElement>(`[name="${name}"]`) ?? null;
  const type = async (name: string, value: string) => {
    const input = field(name);
    if (!input) throw new Error(`no ${name}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const button = (label: string, root: ParentNode | null = dialog()) =>
    [...(root?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) =>
      b.textContent?.replace(/\s+/g, ' ').trim().startsWith(label),
    ) ?? null;
  const press = async (label: string, root?: ParentNode | null) => {
    const b = button(label, root === undefined ? dialog() : root);
    if (!b) throw new Error(`no button ${label}`);
    b.click();
    await settle();
  };
  const escape = async () => {
    document
      .querySelector('.cdk-dialog-container')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await settle();
  };
  const openCreate = async () => press(en.organizations.invitations.create.open, card());
  /** Fills the form, verifies and waits for the result. */
  const createOne = async (invitationType = 'org_admin', wait = 20) => {
    await openCreate();
    await type('invitation-type', invitationType);
    await press(en.organizations.invitations.create.continue);
    await type('step-up-code', '123456');
    await press(en.organizations.invitations.create.verifyAndCreate);
    await settle(wait);
  };
  const world = TestBed.inject(DemoWorld);
  const horizonInvitations = () =>
    world.snapshot().adminInvitations.filter((i) => i.organizationId === HORIZON);
  return {
    page,
    settle,
    card,
    items,
    dialog,
    field,
    type,
    button,
    press,
    escape,
    openCreate,
    createOne,
    world,
    horizonInvitations,
    listSpy,
    toasts: TestBed.inject(NwToastService),
  };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';

/** Every place an invitation code must never reach outside its dialog. */
function exposures(code: string, toasts: NwToastService, world: DemoWorld): string[] {
  const found: string[] = [];
  if (document.documentElement.outerHTML.includes(code)) found.push('DOM');
  if (JSON.stringify({ ...localStorage }).includes(code)) found.push('localStorage');
  if (JSON.stringify({ ...sessionStorage }).includes(code)) found.push('sessionStorage');
  if (location.href.includes(code)) found.push('URL');
  if (toasts.toasts().some((t) => t.message.includes(code))) found.push('toast');
  if (JSON.stringify(world.snapshot()).includes(code)) found.push('world');
  return found;
}

describe('Organization admin invitations (owner, demo build)', () => {
  let clipboard: { writeText: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  });
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('lists the Organization’s invitations newest first, in words, with Revoke on active ones only', async () => {
    const { items } = await render(owner);
    const rows = items().map((li) => text(li));
    expect(rows).toHaveLength(5);
    expect(rows[0]).toContain('Active');
    expect(rows[0]).toContain('org_admin');
    expect(rows[0]).toContain(en.organizations.invitations.list.boundPerson);
    expect(rows[0]).toContain(en.organizations.invitations.list.byYou);
    expect(rows[1]).toContain(en.organizations.invitations.list.bySomeoneElse);
    expect(rows.filter((r) => r.includes('Used'))).toHaveLength(1);
    expect(rows.filter((r) => r.startsWith('Revoked'))).toHaveLength(1);
    expect(rows.filter((r) => r.startsWith('Expired'))).toHaveLength(1);
    const revocable = items().filter((li) => li.querySelector('.admin-invitations__revoke'));
    expect(revocable).toHaveLength(2);
    expect(revocable.every((li) => text(li).startsWith('Active'))).toBe(true);
  });

  it('validates the type and the contact as Core does, before anything is sent', async () => {
    const { settle, dialog, type, press, openCreate, horizonInvitations } = await render(owner);
    await openCreate();
    expect(document.activeElement?.getAttribute('name')).toBe('invitation-type');
    await press(en.organizations.invitations.create.continue);
    expect(text(dialog())).toContain(en.organizations.invitations.form.typeRequired);
    await type('invitation-type', 'admin');
    await press(en.organizations.invitations.create.continue);
    expect(text(dialog())).toContain(en.organizations.invitations.form.typeReserved);
    await type('invitation-type', 'Org Admin');
    await press(en.organizations.invitations.create.continue);
    expect(text(dialog())).toContain('Start with a lowercase letter');
    await type('invitation-type', 'org_admin');
    dialog()?.querySelector<HTMLInputElement>('input[value="person"]')?.click();
    await settle();
    await type('invitee-contact', '12345');
    await press(en.organizations.invitations.create.continue);
    expect(text(dialog())).toContain(en.organizations.invitations.form.contactInvalidPhone);
    expect(document.activeElement?.getAttribute('name')).toBe('invitee-contact');
    expect(horizonInvitations()).toHaveLength(5);
  });

  it('creates once after verification, shows the code once, copies it, and leaves it nowhere after closing', async () => {
    const { settle, dialog, field, type, press, openCreate, items, world, toasts } =
      await render(owner);
    await openCreate();
    await type('invitation-type', 'org_admin');
    dialog()?.querySelector<HTMLInputElement>('input[value="person"]')?.click();
    await settle();
    await type('invitee-contact', ' Amina.K@Example.invalid ');
    await press(en.organizations.invitations.create.continue);
    expect(text(dialog())).toContain('Creating an admin invitation for École Horizon');
    await type('step-up-code', '000000');
    await press(en.organizations.invitations.create.verifyAndCreate);
    expect(text(dialog())).toContain(en.actions.failure.verificationRefused);
    await type('step-up-code', '123456');
    await press(en.organizations.invitations.create.verifyAndCreate);
    await settle(20);
    expect(text(dialog()?.querySelector('h2'))).toBe(en.organizations.invitations.code.title);
    const input = field('invitation-code');
    const code = input?.value ?? '';
    expect(code).toMatch(new RegExp(`^${CODE.source}$`));
    expect(input?.readOnly).toBe(true);
    expect(input?.getAttribute('dir')).toBe('ltr');
    expect(input?.getAttribute('translate')).toBe('no');
    // Never in a live region: the code is in a field, not announced.
    for (const live of document.querySelectorAll('[role="status"], [role="alert"], [aria-live]'))
      expect(live.textContent ?? '').not.toContain(code);
    // The contact typed is never shown back; only "a specific person".
    expect(text(dialog())).not.toContain('amina');
    expect(text(dialog())).toContain(en.organizations.invitations.list.boundPerson);
    // The list behind already shows the new invitation, without its code.
    expect(items()).toHaveLength(6);
    expect(text(items()[0])).not.toContain(code);

    await press(en.organizations.invitations.code.copy);
    expect(clipboard.writeText).toHaveBeenCalledWith(code);
    expect(text(dialog())).toContain(en.organizations.invitations.code.copiedStatus);
    await press(en.organizations.invitations.code.done);
    expect(dialog()).toBeNull();
    expect(exposures(code, toasts, world)).toEqual([]);
    expect(toasts.toasts()).toEqual([]);
  });

  it('falls back to manual copy, asks before closing an uncopied code, and warns without the code when it is lost', async () => {
    const { dialog, field, press, escape, createOne, world, toasts } = await render(owner);
    clipboard.writeText.mockRejectedValue(new Error('denied'));
    await createOne();
    const code = field('invitation-code')?.value ?? '';
    await press(en.organizations.invitations.code.copy);
    expect(text(dialog())).toContain(en.organizations.invitations.code.copyFailed);
    expect(document.activeElement).toBe(field('invitation-code'));
    // Escape before copying: asked first, and back to the code.
    await escape();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.organizations.invitations.code.closeTitle);
    expect(document.activeElement?.textContent?.trim()).toBe(
      en.organizations.invitations.code.backToCode,
    );
    await press(en.organizations.invitations.code.backToCode);
    expect(field('invitation-code')?.value).toBe(code);
    // Done before copying asks too; "Close anyway" closes knowingly (no warning toast).
    await press(en.organizations.invitations.code.done);
    await press(en.organizations.invitations.code.closeAnyway);
    expect(dialog()).toBeNull();
    expect(toasts.toasts()).toEqual([]);
    expect(exposures(code, toasts, world)).toEqual([]);

    // Leaving the page with an uncopied code: closed, with a warning that never carries the code.
    await createOne('manager');
    const second = field('invitation-code')?.value ?? '';
    await TestBed.inject(Router).navigateByUrl(`/platforms/${SCHOOL}/organizations`);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(dialog()).toBeNull();
    expect(toasts.toasts().map((t) => t.message)).toEqual([
      en.organizations.invitations.code.lostUncopied,
    ]);
    expect(exposures(second, toasts, world)).toEqual([]);
  });

  it('cannot be dismissed while creating; a result after the dialog is gone is a toast without any code', async () => {
    const { settle, dialog, type, press, escape, openCreate, horizonInvitations, toasts } =
      await render(owner, {
        latency: 60,
      });
    await openCreate();
    await type('invitation-type', 'org_admin');
    await press(en.organizations.invitations.create.continue);
    await settle(70);
    await type('step-up-code', '123456');
    await press(en.organizations.invitations.create.verifyAndCreate);
    await settle(90);
    expect(text(dialog())).toContain(en.organizations.invitations.create.creating);
    await escape();
    expect(dialog()).not.toBeNull();
    TestBed.inject(Dialog).closeAll();
    await settle(150);
    expect(horizonInvitations()).toHaveLength(6);
    expect(toasts.toasts().map((t) => [t.tone, t.message])).toEqual([
      ['warning', en.organizations.invitations.createdUnseen],
    ]);
    expect(toasts.toasts()[0]?.message).not.toMatch(CODE);
  });

  it('after a lost answer, never retries: it marks what MAY be the new invitation, and only that one', async () => {
    const { dialog, button, press, createOne, items, horizonInvitations, card } = await render(
      owner,
      {
        scenario: 'outcomeUnknown',
      },
    );
    await createOne();
    expect(text(dialog())).toContain(en.organizations.invitations.failure.createUnknown);
    expect(button(en.actions.retry)).toBeNull();
    expect(horizonInvitations()).toHaveLength(6);
    await press(en.organizations.invitations.create.checkInvitations);
    expect(dialog()).toBeNull();
    expect(text(card())).toContain(en.organizations.invitations.possibleNote);
    const marked = items().filter((li) => text(li).includes(en.organizations.invitations.possible));
    expect(marked).toHaveLength(1);
    expect(text(marked[0])).toContain('Active');
    // Nothing was sent again.
    expect(horizonInvitations()).toHaveLength(6);
  });

  it('offers Try again after Core’s rare collision (nothing created), and not after a rate limit', async () => {
    const collision = await render(owner, { scenario: 'collision' });
    await collision.createOne();
    expect(text(collision.dialog())).toContain(en.organizations.invitations.failure.collision);
    await collision.press(en.actions.retry);
    expect(text(collision.dialog()?.querySelector('h2'))).toBe(en.actions.stepUp.title);
    expect(collision.horizonInvitations()).toHaveLength(5);
    TestBed.inject(Dialog).closeAll();
    TestBed.resetTestingModule();
    const limited = await render(owner, { scenario: 'rateLimited' });
    await limited.createOne();
    expect(text(limited.dialog())).toContain(en.organizations.invitations.failure.rateLimited);
    expect(limited.button(en.actions.retry)).toBeNull();
  });

  it('revokes an active invitation after confirmation and verification, then focuses the card', async () => {
    const { dialog, type, press, items, world, toasts, card } = await render(owner);
    await press(en.organizations.invitations.revoke.open, items()[0]);
    expect(document.querySelector('.cdk-dialog-container')?.getAttribute('role')).toBe(
      'alertdialog',
    );
    expect(document.activeElement?.textContent?.trim()).toBe(en.common.cancel);
    expect(text(dialog())).toContain(en.organizations.invitations.revoke.body);
    await press(en.common.cancel);
    expect(dialog()).toBeNull();
    expect(
      world.snapshot().adminInvitations.find((i) => i.id === 'admin-invitation-1')?.revokedAt,
    ).toBeNull();

    await press(en.organizations.invitations.revoke.open, items()[0]);
    await press(en.organizations.invitations.revoke.confirm);
    expect(text(dialog())).toContain('Revoking an admin invitation for École Horizon');
    await type('step-up-code', '123456');
    await press(en.organizations.invitations.revoke.verifyAndRevoke);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(dialog()).toBeNull();
    expect(toasts.toasts().map((t) => t.message)).toEqual([en.organizations.invitations.revoked]);
    expect(
      world.snapshot().adminInvitations.find((i) => i.id === 'admin-invitation-1')?.revokedAt,
    ).not.toBeNull();
    expect(text(items()[0])).toMatch(/^Revoked/);
    expect(document.activeElement).toBe(card()?.querySelector('h2'));
  });

  it('shows the tenant-safe refusal when the invitation can no longer be revoked, and reloads the list', async () => {
    const { dialog, type, press, items, world } = await render(owner);
    await press(en.organizations.invitations.revoke.open, items()[0]);
    // Someone used it meanwhile.
    world.commit((tables) => ({
      ok: true,
      result: null,
      world: {
        ...tables,
        adminInvitations: tables.adminInvitations.map((i) =>
          i.id === 'admin-invitation-1' ? { ...i, consumedAt: '2026-10-23T11:59:00.000Z' } : i,
        ),
      },
    }));
    await press(en.organizations.invitations.revoke.confirm);
    await type('step-up-code', '123456');
    await press(en.organizations.invitations.revoke.verifyAndRevoke);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(text(dialog())).toContain(en.organizations.invitations.failure.revokeRefused);
    await press(en.organizations.invitations.revoke.checkStatus);
    expect(text(items()[0])).toMatch(/^Used/);
  });

  it('shows nothing of a late result to the next person after a sign-out', async () => {
    const { settle, type, press, openCreate, horizonInvitations, toasts } = await render(owner, {
      latency: 60,
    });
    await openCreate();
    await type('invitation-type', 'org_admin');
    await press(en.organizations.invitations.create.continue);
    await settle(70);
    await type('step-up-code', '123456');
    await press(en.organizations.invitations.create.verifyAndCreate);
    await settle(90);
    TestBed.inject(Dialog).closeAll();
    TestBed.inject(AuthSession).signOut();
    await settle(150);
    expect(horizonInvitations()).toHaveLength(6);
    expect(toasts.toasts()).toEqual([]);
  });
});

describe('Organization admin invitations (operator, demo build)', () => {
  it('renders no card, receives no record and never calls the invitation gateway', async () => {
    const { page, card, listSpy, settle } = await render(operator);
    await settle(20);
    expect(text(page.querySelector('h1'))).toBe('École Horizon');
    expect(card()).toBeNull();
    expect(listSpy).not.toHaveBeenCalled();
  });
});
