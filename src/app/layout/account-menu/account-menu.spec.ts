import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import { Actor } from '../../core/auth/actor';
import { AuthGateway, UnavailableAuthGateway } from '../../core/auth/auth.gateway';
import { AuthSession } from '../../core/auth/auth-session';
import { SignOut } from '../../core/auth/sign-out';
import { APP_ENVIRONMENT, DemoBindings } from '../../core/config/app-environment';
import { companyId, platformId } from '../../core/context/scope.model';
import { NwMenuTrigger } from '../../shared/ui/menu/menu';
import { APPEARANCE_SETTINGS_PATH, AccountMenu } from './account-menu';

const DEMO: DemoBindings = {
  signIn: {
    accounts: [],
    password: 'p',
    code: 'c',
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
    serviceHealth: [],
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

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'owner@x.invalid',
  displayName: 'Demo Owner',
  companyId: companyId('c'),
};
const emailOperator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'operator@x.invalid',
  platformAssignments: [platformId('school')],
};
const phoneOperator: Actor = {
  kind: 'operator',
  userId: 'q',
  email: null,
  phone: '+99900000001',
  platformAssignments: [platformId('drive')],
};

@Component({
  imports: [NwMenuTrigger, AccountMenu],
  template: `<button type="button" class="trigger" [nwMenuTriggerFor]="menu">Account</button>
    <ng-template #menu><adm-account-menu /></ng-template>`,
})
class Host {}

async function open(actor: Actor) {
  TestBed.configureTestingModule({
    imports: [
      Host,
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
      { provide: AuthGateway, useClass: UnavailableAuthGateway },
      SignOut,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    '.trigger',
  );
  if (!trigger) throw new Error('trigger not found');
  trigger.focus();
  trigger.click();
  await fixture.whenStable();
  const menu = () => document.querySelector<HTMLElement>('.cdk-overlay-container [role="menu"]');
  const items = () => Array.from(menu()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  return { fixture, trigger, menu, items };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('AccountMenu', () => {
  afterEach(() => {
    document.querySelector('.cdk-overlay-container')?.replaceChildren();
  });

  it('shows who is signed in, then Appearance and Sign out as menu items', async () => {
    const { menu, items } = await open(owner);
    expect(menu()?.getAttribute('aria-label')).toBe(en.shell.account.menuLabel);
    const header = menu()?.querySelector('.account-menu__header');
    expect(header?.getAttribute('aria-hidden')).toBe('true');
    expect(text(header?.querySelector('.account-menu__name'))).toBe('Demo Owner');
    expect(text(header?.querySelector('.account-menu__identifier'))).toBe('owner@x.invalid');
    expect(header?.querySelector('.account-menu__identifier')?.getAttribute('dir')).toBe('ltr');
    expect(text(header?.querySelector('.account-menu__role'))).toBe(en.shell.role.owner);
    expect(items().map((item) => text(item))).toEqual([
      en.shell.account.appearance,
      en.shell.account.signOut,
    ]);
  });

  it('names an operator without a display name by their email, once, as a machine value', async () => {
    const { menu } = await open(emailOperator);
    const name = menu()?.querySelector('.account-menu__name');
    expect(text(name)).toBe('operator@x.invalid');
    expect(name?.getAttribute('dir')).toBe('ltr');
    expect(menu()?.querySelector('.account-menu__identifier')).toBeNull();
    expect(text(menu()?.querySelector('.account-menu__role'))).toBe(en.shell.role.operator);
  });

  it('names a phone-only operator by their phone, left to right', async () => {
    const { menu } = await open(phoneOperator);
    const name = menu()?.querySelector('.account-menu__name');
    expect(text(name)).toBe('+99900000001');
    expect(name?.getAttribute('dir')).toBe('ltr');
  });

  it('opens Appearance settings', async () => {
    const { items, fixture } = await open(owner);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    items()[0]?.click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(APPEARANCE_SETTINGS_PATH);
  });

  it('signs out through the one SignOut', async () => {
    const { items, fixture } = await open(owner);
    const run = vi.spyOn(TestBed.inject(SignOut), 'run').mockResolvedValue();
    items()[1]?.click();
    await fixture.whenStable();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('moves through the items with the arrow keys and closes on Escape, back on its trigger', async () => {
    const { menu, items, trigger, fixture } = await open(owner);
    // CDK reads `keyCode` (jsdom leaves it 0 unless set).
    const keydown = (key: string, keyCode: number) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      Object.defineProperty(event, 'keyCode', { get: () => keyCode });
      return event;
    };
    items()[0]?.focus();
    items()[0]?.dispatchEvent(keydown('ArrowDown', 40));
    await fixture.whenStable();
    expect(document.activeElement).toBe(items()[1]);
    const escape = keydown('Escape', 27);
    items()[1]?.dispatchEvent(escape);
    await fixture.whenStable();
    // Handled by the menu: the shell's drawer leaves an Escape the menu took (`defaultPrevented`) alone.
    expect(escape.defaultPrevented).toBe(true);
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
