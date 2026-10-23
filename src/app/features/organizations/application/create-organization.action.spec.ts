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
import { runtimeOrganizationId } from '../../../demo/world/commands/organization.commands';
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
import { OrganizationDirectoryPage } from '../pages/organization-directory.page';
import { organizationActionTestProviders } from '../testing/organization-actions-testing';
import { Blank, DEMO } from '../testing/organizations-testing';
import { OrganizationDirectoryFacade } from './organization-directory.facade';

const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;
const NEW = runtimeOrganizationId(1);
const DIRECTORY = `/platforms/${SCHOOL}/organizations`;

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
      OrganizationDirectoryPage,
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
        { path: 'platforms', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: {
          production: false,
          demo: { load: async () => ({ ...DEMO, signIn: { ...DEMO.signIn, code: '123456' } }) },
        },
      },
      { provide: DEMO_LATENCY_MS, useValue: latency },
      { provide: NW_CLOCK, useValue: () => Date.parse('2026-10-23T12:00:00Z') },
      { provide: ORGANIZATION_COMMANDS_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      { provide: OrganizationGateway, useClass: MockOrganizationGateway },
      { provide: OrganizationCommercialGateway, useClass: MockOrganizationCommercialGateway },
      ScopeContext,
      EntityLabel,
      OrganizationDirectoryFacade,
      ...organizationActionTestProviders(true),
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.kind === 'owner' ? DEMO_OWNER_ID : DEMO_OPERATOR_IDS.school,
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(DIRECTORY);
  const fixture = TestBed.createComponent(OrganizationDirectoryPage);
  const settle = async (ms = 5) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  // The scope directory, then the list: each answers after the latency.
  await settle(2 * latency + 10);
  const page = fixture.nativeElement as HTMLElement;
  const dialog = () => document.querySelector<HTMLElement>('adm-create-organization-dialog');
  const type = (selector: string, value: string) => {
    const input = dialog()?.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`no ${selector}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
  const press = (label: string) => {
    const button = [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
      (b) => b.textContent?.replace(/\s+/g, ' ').trim() === label,
    );
    if (!button) throw new Error(`no button ${label}`);
    button.click();
  };
  const open = async () => {
    page.querySelector<HTMLButtonElement>('adm-create-organization-button button')?.click();
    await settle();
  };
  /** Name → submit → the code → verify. */
  const createNamed = async (name: string, code = '123456', wait = 20) => {
    type('input[name="organization-name"]', name);
    press(en.organizations.create.submit);
    await settle();
    type('input[name="step-up-code"]', code);
    press(en.organizations.create.verifyAndCreate);
    await settle(wait);
  };
  const world = TestBed.inject(DemoWorld);
  const schoolCount = () =>
    world.snapshot().organizations.filter((o) => o.platformId === SCHOOL).length;
  return {
    page,
    router,
    settle,
    dialog,
    type,
    press,
    open,
    createNamed,
    schoolCount,
    world,
    toasts: TestBed.inject(NwToastService),
  };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Create organization (owner, demo build)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('validates, verifies for organization.create, creates once, opens the new Organization and says so', async () => {
    const { page, router, settle, dialog, type, press, open, schoolCount, world, toasts } =
      await render(owner);
    for (let i = 0; i < 20 && page.querySelectorAll('.organization-table__link').length === 0; i++)
      await settle(10);
    expect(page.querySelectorAll('.organization-table__link')).toHaveLength(16);
    await open();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.organizations.create.title);
    // The parent Platform is shown, never typed; focus starts in the name field.
    expect(text(dialog()?.querySelector('.create-organization__parent'))).toContain(
      'Nawara School',
    );
    expect(document.activeElement?.getAttribute('name')).toBe('organization-name');

    press(en.organizations.create.submit);
    await settle();
    expect(text(dialog())).toContain(en.organizations.create.nameRequired);

    // "More details": collapsed, then the four optional fields; a too-long one opens it and is reported.
    const toggle = dialog()?.querySelector<HTMLButtonElement>('.create-organization__toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(dialog()?.querySelector<HTMLElement>('#create-organization-details')?.hidden).toBe(true);
    type('input[name="organization-name"]', '  École Al Fajr  ');
    type('input[name="organization-phone"]', '1'.repeat(33));
    press(en.organizations.create.submit);
    await settle();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(text(dialog())).toContain('Use 32 characters or fewer.');
    expect(document.activeElement?.getAttribute('name')).toBe('organization-phone');
    expect(schoolCount()).toBe(16);

    type('input[name="organization-phone"]', '+213 21 00 00');
    type('input[name="organization-type"]', 'School');
    press(en.organizations.create.submit);
    await settle();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.actions.stepUp.title);
    expect(text(dialog())).toContain(
      'Creating the organization “⁨École Al Fajr⁩” in ⁨Nawara School⁩',
    );

    type('input[name="step-up-code"]', '000000');
    press(en.organizations.create.verifyAndCreate);
    await settle();
    expect(text(dialog())).toContain(en.actions.failure.verificationRefused);
    expect(schoolCount()).toBe(16);

    type('input[name="step-up-code"]', '123456');
    press(en.organizations.create.verifyAndCreate);
    await settle(20);
    expect(dialog()).toBeNull();
    expect(schoolCount()).toBe(17);
    expect(world.snapshot().organizations.find((o) => o.id === NEW)).toMatchObject({
      name: 'École Al Fajr',
      phone: '+213 21 00 00',
      type: 'School',
      taxCode: null,
      address: null,
    });
    expect(router.url).toBe(`${DIRECTORY}/${NEW}`);
    expect(toasts.toasts().map((t) => [t.tone, t.message])).toEqual([
      ['success', 'Organization “⁨École Al Fajr⁩” created.'],
    ]);
  });

  it('reloads the directory on the change (search included), without leaving the page', async () => {
    const { page, settle, open, createNamed, router } = await render(owner);
    await open();
    await createNamed('École Al Fajr');
    await router.navigateByUrl(`${DIRECTORY}?q=fajr`);
    for (let i = 0; i < 20 && page.querySelectorAll('.organization-table__link').length !== 1; i++)
      await settle(10);
    expect(text(page.querySelector('.organization-table__link'))).toBe('École Al Fajr');
    await router.navigateByUrl(DIRECTORY);
    for (let i = 0; i < 20 && page.querySelectorAll('.organization-table__link').length !== 17; i++)
      await settle(10);
    expect(page.querySelectorAll('.organization-table__link')).toHaveLength(17);
    // Newest first: the new Organization leads the list.
    expect(text(page.querySelector('.organization-table__link'))).toBe('École Al Fajr');
  });

  it('cannot be dismissed while the command runs, and reports its result after the dialog is gone', async () => {
    const { settle, dialog, open, createNamed, schoolCount, toasts, router } = await render(owner, {
      latency: 60,
    });
    await open();
    await createNamed('École Al Fajr', '123456', 90);
    expect(text(dialog())).toContain(en.organizations.create.creating);
    expect(
      dialog()?.querySelector('.nw-dialog__header button')?.getAttribute('aria-disabled'),
    ).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
    await settle();
    expect(dialog()).not.toBeNull();
    // Leaving the page closes the dialog; the command is not cancelled, and the person is not moved.
    TestBed.inject(Dialog).closeAll();
    await settle(120);
    expect(dialog()).toBeNull();
    expect(schoolCount()).toBe(17);
    expect(router.url).toBe(DIRECTORY);
    expect(toasts.toasts().map((t) => t.tone)).toEqual(['success']);
  });

  it('shows nothing of a late result to the next person after a sign-out', async () => {
    const { settle, open, createNamed, schoolCount, toasts } = await render(owner, { latency: 60 });
    await open();
    await createNamed('École Al Fajr', '123456', 90);
    TestBed.inject(Dialog).closeAll();
    TestBed.inject(AuthSession).signOut();
    await settle(120);
    expect(schoolCount()).toBe(17);
    expect(toasts.toasts()).toEqual([]);
  });

  it('sends nothing when the actor changed after opening', async () => {
    const { settle, dialog, type, press, open, schoolCount } = await render(owner);
    await open();
    type('input[name="organization-name"]', 'École Al Fajr');
    press(en.organizations.create.submit);
    await settle();
    TestBed.inject(AuthSession).establish({ ...owner, userId: 'another-owner' });
    type('input[name="step-up-code"]', '123456');
    press(en.organizations.create.verifyAndCreate);
    await settle(20);
    expect(text(dialog())).toContain(en.actions.failure.stale);
    expect(schoolCount()).toBe(16);
  });

  it('sends nothing when the Platform is no longer the actor’s, and says so without detail', async () => {
    const { settle, dialog, type, press, open, schoolCount, world } = await render(owner);
    await open();
    type('input[name="organization-name"]', 'École Al Fajr');
    press(en.organizations.create.submit);
    await settle();
    // The Platform disappears from the actor's directory (e.g. removed elsewhere) while the dialog is open.
    world.commit((tables) => ({
      ok: true,
      result: null,
      world: { ...tables, platforms: tables.platforms.filter((p) => p.id !== SCHOOL) },
    }));
    TestBed.inject(ScopeContext).reload();
    await settle(10);
    type('input[name="step-up-code"]', '123456');
    press(en.organizations.create.verifyAndCreate);
    await settle(20);
    expect(text(dialog())).toContain(en.actions.failure.refused);
    expect(world.snapshot().organizations.some((o) => o.id === NEW)).toBe(false);
    expect(schoolCount()).toBe(16);
  });

  it('after an unknown outcome, retries the same request with a fresh verification: one Organization', async () => {
    const { settle, dialog, type, press, open, createNamed, schoolCount, toasts } = await render(
      owner,
      {
        scenario: 'outcomeUnknown',
      },
    );
    await open();
    await createNamed('École Al Fajr');
    expect(text(dialog())).toContain(en.actions.failure.outcomeUnknown);
    expect(schoolCount()).toBe(17);
    press(en.actions.retry);
    await settle();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.actions.stepUp.title);
    type('input[name="step-up-code"]', '123456');
    press(en.organizations.create.verifyAndCreate);
    await settle(20);
    expect(dialog()).toBeNull();
    expect(schoolCount()).toBe(17);
    expect(toasts.toasts().map((t) => t.tone)).toEqual(['success']);
  });

  it('shows Core’s 409 not_authoritative as its own message, with Close only', async () => {
    const { dialog, open, createNamed, schoolCount } = await render(owner, {
      scenario: 'notAuthoritative',
    });
    await open();
    await createNamed('École Al Fajr');
    expect(text(dialog())).toContain(en.actions.failure.notAuthoritative);
    expect(
      [...(dialog()?.querySelectorAll('button') ?? [])].some((b) => text(b) === en.actions.retry),
    ).toBe(false);
    expect(schoolCount()).toBe(16);
  });
});

describe('Create organization (operator, demo build)', () => {
  it('is shown disabled with its reason, and opens nothing', async () => {
    const { page, dialog, open } = await render(operator);
    const button = page.querySelector('adm-create-organization-button button');
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(text(page.querySelector(`#${button?.getAttribute('aria-describedby')}`))).toBe(
      en.organizations.create.operatorReason,
    );
    await open();
    expect(dialog()).toBeNull();
  });
});
