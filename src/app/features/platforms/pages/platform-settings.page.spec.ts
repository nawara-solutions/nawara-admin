import { Dialog } from '@angular/cdk/dialog';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../../i18n/ar.json';
import en from '../../../../i18n/en.json';
import fr from '../../../../i18n/fr.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT, DemoBindings } from '../../../core/config/app-environment';
import { EntityLabel } from '../../../core/context/entity-label';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { DemoWorld } from '../../../demo/world/demo-world';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { platformRefOf } from '../../../demo/world/selectors';
import { BREADCRUMB_DATA, Breadcrumbs } from '../../../layout/breadcrumbs/breadcrumbs';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { PlatformCommercialGateway } from '../../platform-dashboard/data-access/platform-commercial.gateway';
import { MockPlatformCommercialGateway } from '../../platform-dashboard/data-access/platform-dashboard.mock';
import { EditPlatformAction } from '../application/edit-platform.action';
import { PlatformSettingsFacade } from '../application/platform-settings.facade';
import {
  PlatformCommandGateway,
  UnavailablePlatformCommandGateway,
} from '../data-access/platform-command.gateway';
import {
  MockPlatformCommandGateway,
  PLATFORM_COMMANDS_DEMO_SCENARIO,
  PlatformCommandsDemoScenario,
} from '../data-access/platform-command.mock';
import { PlatformSettingsPage } from './platform-settings.page';

@Component({ template: '' })
class Blank {}

const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;
const SETTINGS = `/platforms/${SCHOOL}/settings`;
const DEMO = { providers: {} } as unknown as DemoBindings;
const LANGS = { en, fr, ar } as const;
type Lang = keyof typeof LANGS;

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

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';

async function render(
  actor: Actor,
  {
    url = SETTINGS,
    lang = 'en' as Lang,
    scenario = 'normal' as PlatformCommandsDemoScenario,
    commands = true,
  } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      PlatformSettingsPage,
      Breadcrumbs,
      TranslocoTestingModule.forRoot({
        langs: { [lang]: LANGS[lang] },
        translocoConfig: { availableLangs: [lang], defaultLang: lang },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        {
          path: 'platforms/:platformId/settings',
          component: Blank,
          data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.platformSettings' },
        },
        { path: '**', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => Date.parse('2026-10-23T12:00:00Z') },
      { provide: PLATFORM_COMMANDS_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      { provide: PlatformCommercialGateway, useClass: MockPlatformCommercialGateway },
      {
        provide: PlatformCommandGateway,
        useClass: commands ? MockPlatformCommandGateway : UnavailablePlatformCommandGateway,
      },
      ScopeContext,
      EntityLabel,
      EditPlatformAction,
      PlatformSettingsFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.kind === 'owner' ? DEMO_OWNER_ID : DEMO_OPERATOR_IDS.school,
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(PlatformSettingsPage);
  const crumbsFixture = TestBed.createComponent(Breadcrumbs);
  const settle = async (ms = 5) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
    await crumbsFixture.whenStable();
  };
  const page = fixture.nativeElement as HTMLElement;
  for (let i = 0; i < 20 && !page.querySelector('[data-identity], nw-data-state'); i++)
    await settle(10);
  await settle(10);
  const dialog = () => document.querySelector<HTMLElement>('adm-edit-platform-dialog');
  const input = () => dialog()?.querySelector<HTMLInputElement>('[name="platform-name"]') ?? null;
  const type = async (value: string) => {
    const field = input();
    if (!field) throw new Error('no name field');
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle();
  };
  const button = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) =>
      text(b).startsWith(label),
    ) ?? null;
  const press = async (label: string) => {
    const b = button(label);
    if (!b) throw new Error(`no button ${label}`);
    b.click();
    await settle(20);
  };
  const editButton = () => page.querySelector<HTMLButtonElement>('[data-edit-name]');
  const open = async () => {
    editButton()?.click();
    await settle();
  };
  const world = TestBed.inject(DemoWorld);
  return {
    page,
    crumbs: crumbsFixture.nativeElement as HTMLElement,
    settle,
    dialog,
    input,
    type,
    button,
    press,
    editButton,
    open,
    world,
    school: () => platformRefOf(world.snapshot(), SCHOOL)!,
    toasts: TestBed.inject(NwToastService),
  };
}

describe('Platform settings page (M4)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('shows the owner the Platform’s identity: the name editable, the key and the product read only', async () => {
    const { page } = await render(owner);
    expect(text(page.querySelector('h1'))).toBe(en.platforms.settings.title);
    expect(text(page.querySelector('[data-name] dd'))).toBe('Nawara School');
    expect(page.querySelector('[data-name] dd bdi')).not.toBeNull();
    expect(text(page.querySelector('[data-key] dd'))).toBe('nawara-school');
    expect(page.querySelector('[data-key] code')?.getAttribute('dir')).toBe('ltr');
    expect(text(page.querySelector('[data-product] dd'))).toBe(en.platforms.product.school);
    for (const fact of ['[data-key]', '[data-product]'])
      expect(text(page.querySelector(`${fact} dt`))).toContain(en.settings.account.readOnly);
    // One control only: "Edit name". No input on the page itself.
    const controls = [...page.querySelectorAll('button, input, select, textarea, [role="switch"]')];
    expect(controls.map((c) => text(c))).toEqual([en.platforms.edit.open]);
    expect(page.querySelector('a[href]')?.getAttribute('href')).toBe(`/platforms/${SCHOOL}`);
  });

  it('shows assisted payments read only (“Eligibility not verified”), with no switch, and no currency or other setting', async () => {
    const { page } = await render(owner);
    const policies = page.querySelector('[data-policies]');
    expect(text(policies?.querySelector('[data-eligibility]'))).toBe(
      en.platformDashboard.policies.notVerified,
    );
    expect(
      policies?.querySelectorAll('button, input, [role="switch"], [aria-checked]'),
    ).toHaveLength(0);
    expect(text(page.querySelector('[data-availability]'))).toBe(
      en.platforms.settings.notConfigurable,
    );
    // No billing currency (D4), deletion or lifecycle control, in words or as a control.
    expect(text(page)).not.toMatch(/currency|delete|archive|suspend/i);
  });

  it('names the page below its Platform in the breadcrumbs, the Platform linked', async () => {
    const { crumbs } = await render(owner);
    const items = [...crumbs.querySelectorAll('.breadcrumbs__item')].map((li) => {
      const copy = li.cloneNode(true) as Element;
      copy.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
      return { text: text(copy), href: li.querySelector('a')?.getAttribute('href') ?? null };
    });
    expect(items.slice(-2)).toEqual([
      { text: 'Nawara School', href: `/platforms/${SCHOOL}` },
      { text: en.shell.breadcrumb.platformSettings, href: null },
    ]);
  });

  it('refuses an assigned operator with the collapsed “not found or not accessible” state', async () => {
    const { page, world } = await render(operator);
    const before = world.snapshot();
    expect(page.querySelector('[data-identity]')).toBeNull();
    expect(page.querySelector('[data-edit-name]')).toBeNull();
    expect(text(page.querySelector('[data-not-accessible]'))).toContain(
      en.platformDashboard.states.notAccessibleTitle,
    );
    // The operator's action is closed too: opening it does nothing.
    const action = TestBed.inject(EditPlatformAction);
    expect(action.mayEdit(SCHOOL)).toBe(false);
    action.open(platformRefOf(before, SCHOOL)!);
    expect(document.querySelector('adm-edit-platform-dialog')).toBeNull();
    expect(world.snapshot()).toBe(before);
  });

  it('says “not found or not accessible” for an unknown Platform, exposing nothing', async () => {
    const { page } = await render(owner, { url: '/platforms/unknown-platform/settings' });
    expect(page.querySelector('[data-identity]')).toBeNull();
    expect(page.querySelector('[data-not-accessible]')).not.toBeNull();
  });

  it('shows "Edit name" disabled, with its reason, in a build without the command', async () => {
    const { page, editButton, open, dialog } = await render(owner, { commands: false });
    expect(editButton()).not.toBeNull();
    expect(editButton()?.getAttribute('aria-disabled')).toBe('true');
    expect(text(page.querySelector('#platform-edit-unavailable'))).toBe(
      en.platforms.edit.notInBuildReason,
    );
    await open();
    expect(dialog()).toBeNull();
  });

  for (const lang of ['en', 'fr', 'ar'] as const)
    it(`is fully translated in ${lang}`, async () => {
      const copy = LANGS[lang];
      const { page, open, dialog } = await render(owner, { lang });
      expect(text(page.querySelector('h1'))).toBe(copy.platforms.settings.title);
      expect(text(page.querySelector('#platform-settings-identity'))).toBe(
        copy.platforms.settings.identity,
      );
      expect(text(page.querySelector('[data-eligibility]'))).toBe(
        copy.platformDashboard.policies.notVerified,
      );
      await open();
      expect(text(dialog()?.querySelector('h2'))).toBe(copy.platforms.edit.title);
      expect(text(dialog())).toContain(copy.platforms.edit.nameLabel);
      for (const root of [page, dialog()!])
        expect(text(root)).not.toMatch(/platforms\.|platformDashboard\.|settings\./);
    });
});

describe('Edit platform name (M4, owner, demo build)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('opens prefilled with focus in the name, saves the trimmed name, refreshes every label and confirms', async () => {
    const { page, crumbs, open, dialog, input, type, press, school, world, toasts, settle } =
      await render(owner);
    await open();
    expect(text(dialog()?.querySelector('h2'))).toBe(en.platforms.edit.title);
    expect(input()?.value).toBe('Nawara School');
    expect(document.activeElement?.getAttribute('name')).toBe('platform-name');
    const before = world.snapshot();
    await type('  Nawara École  ');
    await press(en.platforms.edit.save);
    await settle(20);
    expect(dialog()).toBeNull();
    expect(school()).toEqual({
      id: SCHOOL,
      name: 'Nawara École',
      key: 'nawara-school',
      product: 'school',
    });
    expect(world.snapshot().activity.at(-1)).toMatchObject({
      action: 'platform.updated',
      platformId: SCHOOL,
    });
    expect(world.snapshot().organizations).toBe(before.organizations);
    expect(platformRefOf(world.snapshot(), DEMO_DRIVE_PLATFORM_ID)).toEqual(
      platformRefOf(before, DEMO_DRIVE_PLATFORM_ID),
    );
    expect(toasts.toasts().map((t) => [t.tone, t.message])).toEqual([
      ['success', 'Platform renamed to “⁨Nawara École⁩”.'],
    ]);
    // The page and the breadcrumbs read the shared record again (`ScopeContext.hierarchyChanged`).
    for (let i = 0; i < 10 && text(page.querySelector('[data-name] dd')) !== 'Nawara École'; i++)
      await settle(10);
    expect(text(page.querySelector('[data-name] dd'))).toBe('Nawara École');
    expect(text(page.querySelector('.platform-settings__subtitle'))).toBe('Nawara École');
    expect(text(crumbs)).toContain('Nawara École');
    const scope = TestBed.inject(ScopeContext).platforms();
    expect(scope.status === 'success' && scope.data.find((p) => p.id === SCHOOL)?.name).toBe(
      'Nawara École',
    );
  });

  it('keeps Save disabled for the same name (also after trimming) and writes nothing', async () => {
    const { open, dialog, type, button, press, world } = await render(owner);
    await open();
    const before = world.snapshot();
    expect(button(en.platforms.edit.save)?.getAttribute('aria-disabled')).toBe('true');
    expect(text(dialog())).toContain(en.platforms.edit.noChanges);
    await type('  Nawara School ');
    expect(button(en.platforms.edit.save)?.getAttribute('aria-disabled')).toBe('true');
    await press(en.platforms.edit.save);
    expect(world.snapshot()).toBe(before);
    expect(dialog()).not.toBeNull();
  });

  it('refuses an empty, blank or too long name with the field’s error, sending nothing', async () => {
    const { open, dialog, input, type, press, world } = await render(owner);
    await open();
    const before = world.snapshot();
    for (const [value, message] of [
      ['', en.platforms.edit.nameRequired],
      ['    ', en.platforms.edit.nameRequired],
      ['x'.repeat(201), en.platforms.edit.nameTooLong.replace('{{max}}', '200')],
    ] as const) {
      await type(value);
      await press(en.platforms.edit.save);
      expect(text(dialog()), value).toContain(message);
      expect(input()?.getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(input());
    }
    expect(world.snapshot()).toBe(before);
    // 200 characters is accepted.
    await type('x'.repeat(200));
    await press(en.platforms.edit.save);
    expect(dialog()).toBeNull();
  });

  it('asks before discarding a typed change, and keeps it on "Keep editing"', async () => {
    const { open, dialog, input, type, press } = await render(owner);
    await open();
    await type('Draft');
    await press('Cancel');
    expect(text(dialog()?.querySelector('h2'))).toBe(en.platforms.edit.discardTitle);
    await press(en.platforms.edit.keepEditing);
    expect(input()?.value).toBe('Draft');
    await press('Cancel');
    await press(en.platforms.edit.discard);
    expect(dialog()).toBeNull();
  });

  it('explains 409 not_authoritative and changes nothing', async () => {
    const { open, dialog, type, press, world, button } = await render(owner, {
      scenario: 'notAuthoritative',
    });
    await open();
    const before = world.snapshot();
    await type('Nawara École');
    await press(en.platforms.edit.save);
    expect(text(dialog())).toContain(en.actions.failure.notAuthoritative);
    expect(button(en.actions.retry)).toBeNull();
    expect(world.snapshot()).toBe(before);
  });

  it('offers "Try again" after an outage (503), and nothing was applied', async () => {
    const { open, dialog, type, press, world, button } = await render(owner, {
      scenario: 'unavailable',
    });
    await open();
    const before = world.snapshot();
    await type('Nawara École');
    await press(en.platforms.edit.save);
    expect(text(dialog())).toContain(en.actions.failure.unavailable);
    expect(button(en.actions.retry)).not.toBeNull();
    expect(world.snapshot()).toBe(before);
  });

  it('after a lost answer, re-reads the name and never resends: the change was applied once', async () => {
    const { open, dialog, type, press, world, button, school } = await render(owner, {
      scenario: 'outcomeUnknown',
    });
    await open();
    await type('Nawara École');
    await press(en.platforms.edit.save);
    expect(text(dialog())).toContain(en.platforms.edit.outcomeUnknown);
    expect(button(en.actions.retry)).toBeNull();
    expect(button(en.platforms.edit.save)).toBeNull();
    const updates = () =>
      world.snapshot().activity.filter((e) => e.action === 'platform.updated').length;
    expect(updates()).toBe(1);
    await press(en.platforms.edit.checkCurrent);
    expect(text(dialog())).toContain(en.platforms.edit.reloadedSaved);
    expect(button(en.platforms.edit.save)?.getAttribute('aria-disabled')).toBe('true');
    expect(school().name).toBe('Nawara École');
    expect(updates()).toBe(1);
  });
});
