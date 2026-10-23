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
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
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
import { OrganizationDetailPage } from '../pages/organization-detail.page';
import { organizationActionTestProviders } from '../testing/organization-actions-testing';
import { Blank, DEMO } from '../testing/organizations-testing';
import { OrganizationDetailFacade } from './organization-detail.facade';

const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;
const HORIZON = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c01');
const DETAIL = `/platforms/${SCHOOL}/organizations/${HORIZON}`;

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
  { latency = 0, scenario = 'normal' as OrganizationCommandsDemoScenario } = {},
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
    await fixture.whenStable();
  };
  const page = fixture.nativeElement as HTMLElement;
  for (let i = 0; i < 30 && !page.querySelector('h1 bdi'); i++) await settle(2 * latency + 10);
  const dialog = () => document.querySelector<HTMLElement>('adm-edit-organization-dialog');
  const field = (name: string) =>
    dialog()?.querySelector<HTMLInputElement>(`[name="organization-${name}"]`) ?? null;
  /** Types into a field and lets the view update (in a browser, rendering happens between typing and a click). */
  const type = async (name: string, value: string) => {
    const input = field(name);
    if (!input) throw new Error(`no ${name}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const button = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) =>
      b.textContent?.replace(/\s+/g, ' ').trim().startsWith(label),
    ) ?? null;
  const press = (label: string) => {
    const b = button(label);
    if (!b) throw new Error(`no button ${label}`);
    b.click();
  };
  const editButton = () =>
    [...page.querySelectorAll<HTMLButtonElement>('adm-overview-card button')].find(
      (b) => b.textContent?.trim() === en.organizations.edit.open,
    ) ?? null;
  const open = async () => {
    editButton()?.focus();
    editButton()?.click();
    await settle();
  };
  const escape = () =>
    document
      .querySelector('.cdk-dialog-container')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  const horizon = () => world.snapshot().organizations.find((o) => o.id === HORIZON)!;
  return {
    page,
    router,
    settle,
    dialog,
    field,
    type,
    button,
    press,
    editButton,
    open,
    escape,
    horizon,
    world,
    toasts: TestBed.inject(NwToastService),
  };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';

describe('Edit organization details (owner, demo build)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('opens prefilled, saves only the changed fields, refreshes the page and its breadcrumb, and returns focus', async () => {
    const {
      page,
      settle,
      dialog,
      field,
      type,
      button,
      press,
      editButton,
      open,
      horizon,
      world,
      toasts,
    } = await render(owner);
    expect(editButton()).not.toBeNull();
    await open();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.organizations.edit.title);
    expect(document.activeElement?.getAttribute('name')).toBe('organization-name');
    expect(field('name')?.value).toBe('École Horizon');
    expect(field('phone')?.value).toBe('+213 21 00 00');
    expect(field('taxCode')?.value).toBe('');
    // Nothing changed (whitespace only): Save is disabled and says why.
    await type('type', ' School ');
    await settle();
    expect(button(en.organizations.edit.save)?.getAttribute('aria-disabled')).toBe('true');
    expect(text(dialog())).toContain(en.organizations.edit.noChanges);
    const before = world.snapshot();
    press(en.organizations.edit.save);
    await settle();
    expect(world.snapshot()).toBe(before);

    await type('name', 'École Horizon – Annexe');
    await type('phone', '');
    await settle();
    // Changes are said in words (the hint), not only by colour.
    expect(text(dialog())).toContain('Changed. Was “École Horizon”.');
    expect(text(dialog())).toContain('Will be removed. Was “+213 21 00 00”. Saving removes it.');
    expect(button(en.organizations.edit.save)?.getAttribute('aria-disabled')).toBeNull();
    // Undo restores the removed value and returns focus to it.
    press(en.organizations.edit.undo);
    await settle();
    expect(field('phone')?.value).toBe('+213 21 00 00');
    expect(document.activeElement?.getAttribute('name')).toBe('organization-phone');
    await type('phone', '');
    await settle();

    press(en.organizations.edit.save);
    await settle(20);
    expect(dialog()).toBeNull();
    expect(horizon()).toMatchObject({
      name: 'École Horizon – Annexe',
      phone: null,
      type: 'School',
    });
    expect(world.snapshot().activity.at(-1)).toMatchObject({ action: 'organization.updated' });
    expect(toasts.toasts().map((t) => [t.tone, t.message])).toEqual([
      ['success', 'Details of “⁨École Horizon – Annexe⁩” saved.'],
    ]);
    for (let i = 0; i < 20 && text(page.querySelector('h1')) !== 'École Horizon – Annexe'; i++)
      await settle(10);
    expect(text(page.querySelector('h1'))).toBe('École Horizon – Annexe');
    expect(TestBed.inject(EntityLabel).labelFor(DETAIL)).toBe('École Horizon – Annexe');
    expect(text(page)).not.toContain('+213 21 00 00');
    // The page refreshed in place: the same button is still there and has focus back.
    expect(document.activeElement).toBe(editButton());
  });

  it('refuses a blank name in the field, sending nothing', async () => {
    const { settle, dialog, type, press, open, world } = await render(owner);
    await open();
    const before = world.snapshot();
    await type('name', '   ');
    press(en.organizations.edit.save);
    await settle();
    expect(text(dialog())).toContain(en.organizations.edit.nameRequired);
    expect(document.activeElement?.getAttribute('name')).toBe('organization-name');
    expect(world.snapshot()).toBe(before);
  });

  it('asks before discarding changes (Escape, backdrop, close, Cancel), and closes at once without changes', async () => {
    const { settle, dialog, type, press, open, escape, world } = await render(owner);
    await open();
    press(en.common.cancel);
    await settle();
    expect(dialog()).toBeNull();

    await open();
    const before = world.snapshot();
    await type('type', 'Secondary school');
    await settle();
    escape();
    await settle();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.organizations.edit.discardTitle);
    expect(text(dialog())).toContain('Type: Changed');
    expect(document.activeElement?.textContent?.trim()).toBe(en.organizations.edit.keepEditing);
    press(en.organizations.edit.keepEditing);
    await settle();
    expect(document.querySelector<HTMLInputElement>('[name="organization-type"]')?.value).toBe(
      'Secondary school',
    );
    document.querySelector<HTMLElement>('.cdk-overlay-backdrop')?.click();
    await settle();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.organizations.edit.discardTitle);
    press(en.organizations.edit.discard);
    await settle();
    expect(dialog()).toBeNull();
    expect(world.snapshot()).toBe(before);
  });

  it('cannot be dismissed while saving, and reports the result after the page is left', async () => {
    const { settle, dialog, type, press, open, escape, horizon, toasts } = await render(owner, {
      latency: 60,
    });
    await open();
    await type('type', 'Secondary school');
    press(en.organizations.edit.save);
    await settle(10);
    expect(text(dialog())).toContain(en.organizations.edit.saving);
    expect(
      dialog()?.querySelector('.nw-dialog__header button')?.getAttribute('aria-disabled'),
    ).toBe('true');
    escape();
    await settle();
    expect(dialog()).not.toBeNull();
    TestBed.inject(Dialog).closeAll();
    await settle(120);
    expect(horizon().type).toBe('Secondary school');
    expect(toasts.toasts().map((t) => t.tone)).toEqual(['success']);
  });

  it('closes when the person navigates away from the Organization', async () => {
    const { settle, dialog, type, open, router, world } = await render(owner);
    await open();
    const before = world.snapshot();
    await type('type', 'Secondary school');
    await router.navigateByUrl(`/platforms/${SCHOOL}/organizations`);
    await settle();
    expect(dialog()).toBeNull();
    expect(world.snapshot()).toBe(before);
  });

  it('after a lost answer, never resends: the person checks the current details, which show the change applied', async () => {
    const { settle, dialog, type, button, press, open, world } = await render(owner, {
      scenario: 'outcomeUnknown',
    });
    await open();
    await type('type', 'Secondary school');
    press(en.organizations.edit.save);
    await settle(20);
    expect(text(dialog())).toContain(en.organizations.edit.outcomeUnknown);
    expect(button(en.actions.retry)).toBeNull();
    const updates = () =>
      world.snapshot().activity.filter((a) => a.action === 'organization.updated');
    expect(updates()).toHaveLength(1);
    press(en.organizations.edit.checkCurrent);
    await settle(20);
    // The current details are the new starting point: the change is already there, nothing left to save.
    expect(text(dialog())).toContain(en.organizations.edit.reloadedSaved);
    expect(button(en.organizations.edit.save)?.getAttribute('aria-disabled')).toBe('true');
    expect(updates()).toHaveLength(1);
  });

  it('after a lost answer, adopts others’ changes and keeps the person’s own, marked against the current details', async () => {
    const { settle, dialog, field, type, button, press, open, world, horizon } = await render(
      owner,
      {
        scenario: 'outcomeUnknown',
      },
    );
    await open();
    await type('type', 'Secondary school');
    press(en.organizations.edit.save);
    await settle(20);
    // Meanwhile someone else renamed it, and set the type back.
    world.commit((tables) => ({
      ok: true,
      result: null,
      world: {
        ...tables,
        organizations: tables.organizations.map((o) =>
          o.id === HORIZON ? { ...o, name: 'Horizon (renamed)', type: 'School' } : o,
        ),
      },
    }));
    press(en.organizations.edit.checkCurrent);
    await settle(20);
    expect(text(dialog())).toContain(en.organizations.edit.reloadedKept);
    // The untouched name follows the current value; the person's type change is kept and marked, not sent.
    expect(field('name')?.value).toBe('Horizon (renamed)');
    expect(text(dialog())).toContain('Changed. Was “School”.');
    expect(horizon()).toMatchObject({ name: 'Horizon (renamed)', type: 'School' });
    // Saving again is the person's decision: it sends only the type.
    press(en.organizations.edit.save);
    await settle(20);
    expect(dialog()).toBeNull();
    expect(horizon()).toMatchObject({ name: 'Horizon (renamed)', type: 'Secondary school' });
    expect(button(en.organizations.edit.save)).toBeNull();
  });

  it('shows Core’s 409 not_authoritative with Close only, changing nothing', async () => {
    const { settle, dialog, type, button, press, open, horizon } = await render(owner, {
      scenario: 'notAuthoritative',
    });
    await open();
    await type('type', 'Secondary school');
    press(en.organizations.edit.save);
    await settle(20);
    expect(text(dialog())).toContain(en.actions.failure.notAuthoritative);
    expect(button(en.actions.retry)).toBeNull();
    expect(horizon().type).toBe('School');
  });

  it('sends nothing when the actor changed after opening', async () => {
    const { settle, dialog, type, press, open, world } = await render(owner);
    await open();
    const before = world.snapshot();
    await type('type', 'Secondary school');
    TestBed.inject(AuthSession).establish({ ...owner, userId: 'another-owner' });
    press(en.organizations.edit.save);
    await settle(20);
    expect(text(dialog())).toContain(en.actions.failure.stale);
    expect(world.snapshot()).toBe(before);
  });

  it('shows nothing of a late result to the next person after a sign-out', async () => {
    const { settle, type, press, open, horizon, toasts } = await render(owner, { latency: 60 });
    await open();
    await type('type', 'Secondary school');
    press(en.organizations.edit.save);
    await settle(10);
    TestBed.inject(Dialog).closeAll();
    TestBed.inject(AuthSession).signOut();
    await settle(120);
    expect(horizon().type).toBe('Secondary school');
    expect(toasts.toasts()).toEqual([]);
  });
});

describe('Edit organization details (assigned operator, demo build)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('edits an Organization of their Platform, with no verification step', async () => {
    const { settle, dialog, type, press, open, horizon } = await render(operator);
    await open();
    await type('type', 'Secondary school');
    press(en.organizations.edit.save);
    await settle(20);
    expect(dialog()).toBeNull();
    expect(horizon().type).toBe('Secondary school');
  });

  it('sends nothing once the Platform assignment is gone', async () => {
    const { settle, dialog, type, press, open, world } = await render(operator);
    await open();
    await type('type', 'Secondary school');
    TestBed.inject(AuthSession).establish({ ...operator, platformAssignments: [] });
    press(en.organizations.edit.save);
    await settle(20);
    expect(text(dialog())).toContain(en.actions.failure.stale);
    expect(world.snapshot().organizations.find((o) => o.id === HORIZON)?.type).toBe('School');
  });
});
