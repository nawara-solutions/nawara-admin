import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT, DemoBindings } from '../../../core/config/app-environment';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DEMO_COMPANY_ID, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { PlatformDirectoryGateway } from '../data-access/platform-directory.gateway';
import { MockPlatformDirectoryGateway } from '../data-access/platform-directory.mock';
import { PlatformsPage } from '../pages/platforms.page';
import { createPlatformTestProviders } from '../testing/create-platform-testing';
import { PlatformDirectoryFacade } from './platform-directory.facade';

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'o@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [],
};
const DEMO: DemoBindings = {
  signIn: {
    accounts: [],
    password: 'p',
    code: '123456',
    operators: [],
    workingCode: 'w',
    newOperators: [],
    confirmationCode: 'k',
  },
  providers: {
    auth: [],
    scopeDirectory: [],
    notificationSummary: [],
    platformDirectory: [],
    companyOverview: [],
    commercialSummary: [],
    licenses: [],
    billing: [],
    activity: [],
    services: [],
    platformDashboard: [],
    platformCommercial: [],
    organizations: [],
    organizationCommercial: [],
    platformCommands: [],
    organizationCommands: [],
    adminInvitations: [],
    memberships: [],
    operators: [],
    stepUp: [],
  },
};

async function render(actor: Actor, latency = 0) {
  TestBed.configureTestingModule({
    imports: [
      PlatformsPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: latency },
      { provide: NW_CLOCK, useValue: () => Date.parse('2026-10-23T12:00:00Z') },
      { provide: PlatformDirectoryGateway, useClass: MockPlatformDirectoryGateway },
      PlatformDirectoryFacade,
      ...createPlatformTestProviders(true),
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.kind === 'owner' ? DEMO_OWNER_ID : null,
  });
  const fixture = TestBed.createComponent(PlatformsPage);
  const settle = async (ms = 5) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  await settle();
  const page = fixture.nativeElement as HTMLElement;
  const dialog = () => document.querySelector<HTMLElement>('adm-create-platform-dialog');
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
  return {
    fixture,
    page,
    settle,
    dialog,
    type,
    press,
    toasts: TestBed.inject(NwToastService),
    world: TestBed.inject(DemoWorld),
  };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('Create platform (owner, demo build)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('validates, verifies, creates once, refreshes the directory and says so', async () => {
    const { page, settle, dialog, type, press, toasts, world } = await render(owner);
    page.querySelector<HTMLButtonElement>('.platforms-header__create-button--live')?.click();
    await settle();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.platforms.create.title);

    press(en.platforms.create.submit);
    await settle();
    expect(text(dialog())).toContain(en.platforms.create.nameRequired);
    expect(world.snapshot().platforms).toHaveLength(2);

    type('input[name="platform-name"]', 'Nawara Academy');
    press(en.platforms.create.submit);
    await settle();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.actions.stepUp.title);
    // The name is isolated (FSI … PDI) inside the sentence, so it reads right in either direction.
    expect(text(dialog())).toContain('Creating the platform “\u2068Nawara Academy\u2069”');
    expect(text(dialog())).toContain(en.actions.stepUp.demoTitle);

    type('input[name="step-up-code"]', '000000');
    press(en.platforms.create.verifyAndCreate);
    await settle();
    expect(text(dialog())).toContain(en.actions.failure.verificationRefused);
    expect(world.snapshot().platforms).toHaveLength(2);

    type('input[name="step-up-code"]', '123456');
    press(en.platforms.create.verifyAndCreate);
    await settle(20);
    expect(dialog()).toBeNull();
    expect(world.snapshot().platforms.map((p) => p.name)).toEqual([
      'Nawara School',
      'Nawara Drive',
      'Nawara Academy',
    ]);
    expect(toasts.toasts().map((t) => [t.tone, t.message])).toEqual([
      ['success', 'Platform “\u2068Nawara Academy\u2069” created.'],
    ]);
    // The directory reloads on the hierarchy change: the new Platform is listed.
    for (let i = 0; i < 20 && page.querySelectorAll('adm-platform-card').length < 3; i++)
      await settle(10);
    expect(text([...page.querySelectorAll('adm-platform-card')].at(-1))).toContain(
      'Nawara Academy',
    );
  });

  it('cannot be dismissed while the command runs, and reports its result after the dialog is gone', async () => {
    const { page, settle, dialog, type, press, toasts, world } = await render(owner, 60);
    page.querySelector<HTMLButtonElement>('.platforms-header__create-button--live')?.click();
    await settle();
    type('input[name="platform-name"]', 'Nawara Academy');
    press(en.platforms.create.submit);
    await settle();
    type('input[name="step-up-code"]', '123456');
    press(en.platforms.create.verifyAndCreate);
    await settle(90);
    expect(text(dialog())).toContain(en.platforms.create.creating);
    expect(
      dialog()?.querySelector('.nw-dialog__header button')?.getAttribute('aria-disabled'),
    ).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
    await settle();
    expect(dialog()).not.toBeNull();
    // Leaving the page closes the dialog; the command is not cancelled.
    TestBed.inject(Dialog).closeAll();
    await settle(120);
    expect(dialog()).toBeNull();
    expect(world.snapshot().platforms).toHaveLength(3);
    expect(toasts.toasts().map((t) => t.tone)).toEqual(['success']);
  });

  it('shows nothing of a late result to the next person after a sign-out', async () => {
    const { page, settle, type, press, toasts, world } = await render(owner, 60);
    page.querySelector<HTMLButtonElement>('.platforms-header__create-button--live')?.click();
    await settle();
    type('input[name="platform-name"]', 'Nawara Academy');
    press(en.platforms.create.submit);
    await settle();
    type('input[name="step-up-code"]', '123456');
    press(en.platforms.create.verifyAndCreate);
    await settle(90);
    TestBed.inject(Dialog).closeAll();
    TestBed.inject(AuthSession).signOut();
    await settle(120);
    // The simulated Core applied it; the signed-out session is told nothing.
    expect(world.snapshot().platforms).toHaveLength(3);
    expect(toasts.toasts()).toEqual([]);
  });

  it('is never offered to an operator', async () => {
    const { page } = await render(operator);
    expect(page.querySelector('.platforms-header__create-button')).toBeNull();
  });
});
