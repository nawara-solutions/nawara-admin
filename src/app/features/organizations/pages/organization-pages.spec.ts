import { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { of } from 'rxjs';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { EntityLabel } from '../../../core/context/entity-label';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { NW_CLOCK } from '../../../shared/format/clock';
import { OrganizationDetailFacade } from '../application/organization-detail.facade';
import { OrganizationDirectoryFacade } from '../application/organization-directory.facade';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import {
  Blank,
  DEMO,
  NOW,
  PLATFORMS,
  ScriptedCommercial,
  ScriptedDirectory,
  ScriptedOrganizations,
  commercialListOf,
  commercialOf,
  detailOf,
  directoryOf,
  operator,
  owner,
} from '../testing/organizations-testing';
import { organizationActionTestProviders } from '../testing/organization-actions-testing';
import { OrganizationDetailPage } from './organization-detail.page';
import { OrganizationDirectoryPage } from './organization-directory.page';

async function render<T>(page: Type<T>, actor: Actor, url: string) {
  TestBed.configureTestingModule({
    imports: [
      page,
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
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ScopeDirectoryGateway, useClass: ScriptedDirectory },
      { provide: OrganizationGateway, useClass: ScriptedOrganizations },
      { provide: OrganizationCommercialGateway, useClass: ScriptedCommercial },
      ScopeContext,
      EntityLabel,
      OrganizationDirectoryFacade,
      OrganizationDetailFacade,
      ...organizationActionTestProviders(false),
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(page);
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  };
  await settle();
  return {
    fixture,
    router,
    settle,
    element: fixture.nativeElement as HTMLElement,
    organizations: TestBed.inject(OrganizationGateway) as ScriptedOrganizations,
    commercial: TestBed.inject(OrganizationCommercialGateway) as ScriptedCommercial,
  };
}

const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('OrganizationDirectoryPage', () => {
  afterEach(() => {
    ScriptedDirectory.answer = () => of(PLATFORMS);
  });

  it('shows the owner every Organization with links, the commercial columns and the totals', async () => {
    const { element, organizations, commercial, settle } = await render(
      OrganizationDirectoryPage,
      owner,
      '/platforms/school/organizations',
    );
    organizations.lists[0]?.answer.next(directoryOf());
    commercial.lists[0]?.answer.next(commercialListOf());
    await settle();
    expect(text(element.querySelector('h1'))).toBe(en.organizations.header.directoryTitle);
    expect(text(element.querySelector('.organizations-header__eyebrow'))).toBe('Nawara School');
    const links = [...element.querySelectorAll('.organization-table__link')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/platforms/school/organizations/horizon',
      '/platforms/school/organizations/riad',
      '/platforms/school/organizations/atlas',
    ]);
    const headers = [...element.querySelectorAll('.organization-table__table thead th')].map((th) =>
      text(th),
    );
    expect(headers).toContain(en.organizations.table.subscription);
    expect(headers).toContain(en.organizations.table.assistedPayments);
    // Collège Riad's subscription ends within 14 days: the note says when.
    expect(text(element.querySelectorAll('.organization-table__table tbody tr')[1])).toContain(
      'Ends in 6 days',
    );
    expect(text(element.querySelector('.organization-directory__count'))).toBe('Showing 3 of 3');
    expect(element.querySelector('.organization-directory__count')?.getAttribute('role')).toBe(
      'status',
    );
    expect(element.querySelectorAll('.organization-directory__total dd').length).toBe(4);
    // A build without the command (here: no adapter) still shows Create organization, disabled with its reason.
    const create = element.querySelector('adm-create-organization-button button');
    expect(text(create)).toBe(en.organizations.create.open);
    expect(create?.getAttribute('aria-disabled')).toBe('true');
    expect(text(element.querySelector(`#${create?.getAttribute('aria-describedby')}`))).toBe(
      en.organizations.create.notInBuildReason,
    );
  });

  it('shows an operator no subscription filter and no commercial column', async () => {
    const { element, organizations, commercial, settle } = await render(
      OrganizationDirectoryPage,
      operator,
      '/platforms/school/organizations',
    );
    organizations.lists[0]?.answer.next(directoryOf());
    await settle();
    expect(commercial.lists).toHaveLength(0);
    expect(element.querySelectorAll('select')).toHaveLength(1);
    const headers = [...element.querySelectorAll('.organization-table__table thead th')].map((th) =>
      text(th),
    );
    expect(headers).not.toContain(en.organizations.table.subscription);
    expect(element.querySelector('nw-status-badge')).toBeNull();
    // Core authorizes an operator, but no operator step-up exists: shown disabled, with that reason.
    const create = element.querySelector('adm-create-organization-button button');
    expect(create?.getAttribute('aria-disabled')).toBe('true');
    expect(text(element.querySelector(`#${create?.getAttribute('aria-describedby')}`))).toBe(
      en.organizations.create.operatorReason,
    );
  });

  it('filters from the URL, says when nothing matches, and clears the search and filters', async () => {
    const { element, organizations, commercial, settle, router } = await render(
      OrganizationDirectoryPage,
      owner,
      '/platforms/school/organizations?q=zzz&requests=1',
    );
    organizations.lists[0]?.answer.next(directoryOf());
    commercial.lists[0]?.answer.next(commercialListOf());
    await settle();
    expect(text(element)).toContain(en.organizations.states.noResultsTitle);
    const pressed = [...element.querySelectorAll('.organization-directory__segment')].map((b) =>
      b.getAttribute('aria-pressed'),
    );
    expect(pressed).toEqual(['false', 'true']);
    const clear = [...element.querySelectorAll('button')].find(
      (b) => text(b) === en.organizations.states.clearAll,
    );
    clear?.click();
    await settle();
    expect(router.url).toBe('/platforms/school/organizations');
    expect(element.querySelectorAll('.organization-table__link')).toHaveLength(3);
  });

  it('keeps every typed character, writing the search to the URL once typing pauses', async () => {
    const { element, organizations, commercial, settle, router } = await render(
      OrganizationDirectoryPage,
      owner,
      '/platforms/school/organizations',
    );
    organizations.lists[0]?.answer.next(directoryOf());
    commercial.lists[0]?.answer.next(commercialListOf());
    await settle();
    const input = element.querySelector<HTMLInputElement>('.organization-directory__search-input');
    for (const typed of ['r', 'ri', 'ria', 'riad']) {
      if (input) input.value = typed;
      input?.dispatchEvent(new Event('input'));
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    await settle();
    expect(input?.value).toBe('riad');
    expect(router.url).toBe('/platforms/school/organizations?q=riad');
    expect(element.querySelectorAll('.organization-table__link')).toHaveLength(1);
    element.querySelector<HTMLButtonElement>('.organization-directory__clear')?.click();
    await settle();
    expect(input?.value).toBe('');
    expect(router.url).toBe('/platforms/school/organizations');
  });

  it('shows a Platform without Organizations as empty, and an outage with “Try again”', async () => {
    const { element, organizations, settle } = await render(
      OrganizationDirectoryPage,
      owner,
      '/platforms/school/organizations',
    );
    organizations.lists[0]?.answer.next({ platformId: PLATFORMS[0]!.id, organizations: [] });
    await settle();
    expect(text(element)).toContain(en.organizations.states.emptyTitle);
    expect(element.querySelector('[role="search"]')).toBeNull();
    expect(element.querySelectorAll('adm-create-organization-button')).toHaveLength(2);
    TestBed.resetTestingModule();
    const outage = await render(
      OrganizationDirectoryPage,
      owner,
      '/platforms/school/organizations',
    );
    outage.organizations.lists[0]?.answer.error({ kind: 'unavailable', status: 503 });
    await outage.settle();
    expect(text(outage.element)).toContain(en.organizations.states.errorTitle);
    expect(text(outage.element)).toContain(en.organizations.states.retry);
  });

  it('shows one “not found or not accessible” state for a Platform outside the actor’s scope', async () => {
    const { element, organizations } = await render(
      OrganizationDirectoryPage,
      operator,
      '/platforms/drive/organizations',
    );
    expect(text(element.querySelector('h1'))).toBe(en.organizations.states.notAccessibleTitle);
    expect(organizations.lists).toHaveLength(0);
    expect(element.querySelector('adm-create-organization-button button')).toBeNull();
  });
});

describe('OrganizationDetailPage', () => {
  afterEach(() => {
    ScriptedDirectory.answer = () => of(PLATFORMS);
  });

  it('shows the owner identity, figures, membership, activity, About and the commercial sections', async () => {
    const { element, organizations, commercial, settle } = await render(
      OrganizationDetailPage,
      owner,
      '/platforms/school/organizations/riad',
    );
    organizations.loads[0]?.answer.next({
      ...detailOf(),
      metadata: { taxCode: null, address: null, phone: '+213 21 00 00', type: 'School' },
    });
    await settle();
    commercial.loads[0]?.answer.next(commercialOf());
    await settle();
    expect(text(element.querySelector('h1'))).toBe('Collège Riad');
    expect(element.querySelector('.organization-detail__platform')?.getAttribute('href')).toBe(
      '/platforms/school',
    );
    expect(element.querySelectorAll('adm-summary-card')).toHaveLength(3);
    expect([...element.querySelectorAll('h2')].map((h) => text(h))).toEqual([
      en.organizations.detail.membership,
      en.organizations.invitations.title,
      en.organizations.detail.activity,
      en.organizations.detail.about,
      en.organizations.detail.subscription,
      en.organizations.detail.payments,
      en.organizations.detail.assistedPayments,
    ]);
    expect(text(element)).toContain(en.organizations.activity.adminInvitationCreated);
    // A build without the invitation gateway: the owner's card says so, and Create is disabled with that reason.
    const card = element.querySelector('adm-admin-invitations-card');
    expect(text(card)).toContain(en.organizations.invitations.notInBuild);
    const create = card?.querySelector('button');
    expect(create?.getAttribute('aria-disabled')).toBe('true');
    expect(text(element.querySelector(`#${create?.getAttribute('aria-describedby')}`))).toBe(
      en.organizations.invitations.notInBuild,
    );
    expect(element.querySelector('.organization-detail__id')?.getAttribute('dir')).toBe('ltr');
    // About lists the optional fields that were given, and only those; a phone number reads left to right.
    const about = [...element.querySelectorAll('.organization-detail__row dt')].map((dt) =>
      text(dt),
    );
    expect(about).toContain(en.organizations.detail.type);
    expect(about).toContain(en.organizations.detail.phone);
    expect(about).not.toContain(en.organizations.detail.taxCode);
    expect(about).not.toContain(en.organizations.detail.address);
    const phone = [...element.querySelectorAll('.organization-detail__row bdi')].find(
      (b) => text(b) === '+213 21 00 00',
    );
    expect(phone?.getAttribute('dir')).toBe('ltr');
    // A build without the command (here: no adapter) shows Edit details in About, disabled, with its reason.
    const edit = [...element.querySelectorAll('adm-overview-card button')].find(
      (b) => text(b) === en.organizations.edit.open,
    );
    expect(edit?.getAttribute('aria-disabled')).toBe('true');
    expect(text(element.querySelector(`#${edit?.getAttribute('aria-describedby')}`))).toBe(
      en.organizations.edit.notInBuildReason,
    );
    // Future actions are focusable, never actionable, and say why.
    const unavailable = [...element.querySelectorAll('.organization-detail__unavailable-action')];
    expect(unavailable.map((b) => b.getAttribute('aria-disabled'))).toEqual(['true', 'true']);
    // No lifecycle status is invented.
    expect(text(element).toLowerCase()).not.toMatch(/\b(suspended|archived|provisioned)\b/);
  });

  it('links the owner’s activity card to the activity browser with this Organization preselected (P8-S1)', async () => {
    const { element, organizations, settle } = await render(
      OrganizationDetailPage,
      owner,
      '/platforms/school/organizations/riad',
    );
    organizations.loads[0]?.answer.next(detailOf());
    await settle();
    const link = element.querySelector('[data-activity-browser]');
    expect(text(link)).toBe(en.organizations.detail.openActivity);
    expect(link?.getAttribute('href')).toBe('/audit?platform=school&organization=riad');
  });

  it('shows an operator the hierarchy facts only', async () => {
    const { element, organizations, commercial, settle } = await render(
      OrganizationDetailPage,
      operator,
      '/platforms/school/organizations/riad',
    );
    organizations.loads[0]?.answer.next({
      ...detailOf(),
      adminInvitationsAwaiting: { status: 'unavailable' },
      activity: { status: 'unavailable' },
    });
    await settle();
    expect(commercial.loads).toHaveLength(0);
    expect(element.querySelectorAll('adm-summary-card')).toHaveLength(2);
    expect([...element.querySelectorAll('h2')].map((h) => text(h))).toEqual([
      en.organizations.detail.membership,
      en.organizations.detail.about,
    ]);
    // No invitation card for operators (Core refuses them), and no activity browser link.
    expect(element.querySelector('adm-admin-invitations-card')).toBeNull();
    expect(element.querySelector('[data-activity-browser]')).toBeNull();
    expect(text(element.querySelector('.organization-detail__access'))).toBe(
      en.organizations.header.accessOperator,
    );
  });

  it('shows the subscription, its timeline and the entitlement as separate rows, per state (P7-S2)', async () => {
    const d = en.organizations.detail;
    const HOUR = 3_600_000;
    const cases = [
      {
        subscription: { state: 'active', endsAt: new Date(NOW + 6 * 24 * HOUR).toISOString() },
        entitlement: 'entitled',
        rows: [d.subscriptionState, d.endsAt, d.entitledNow],
        value: en.organizations.entitlement.entitled,
        note: d.activeNote,
      },
      {
        subscription: {
          state: 'grace',
          endsAt: new Date(NOW - 6 * HOUR).toISOString(),
          graceEndsAt: new Date(NOW + 18 * HOUR).toISOString(),
        },
        entitlement: 'entitledInGrace',
        rows: [d.subscriptionState, d.endedAt, d.graceEndsAt, d.entitledNow],
        value: en.organizations.entitlement.entitledInGrace,
        note: d.graceNote,
      },
      {
        subscription: { state: 'none' },
        entitlement: 'notEntitled',
        rows: [d.subscriptionState, d.entitledNow],
        value: en.organizations.entitlement.notEntitled,
        note: d.noSubscriptionNote,
      },
    ] as const;
    for (const c of cases) {
      const { element, organizations, commercial, settle } = await render(
        OrganizationDetailPage,
        owner,
        '/platforms/school/organizations/riad',
      );
      organizations.loads[0]?.answer.next(detailOf());
      await settle();
      commercial.loads[0]?.answer.next({
        ...commercialOf(),
        subscription: { status: 'available', data: c.subscription },
        entitlement: { status: 'available', data: c.entitlement },
      });
      await settle();
      const section = element.querySelector('[data-subscription]');
      expect([...(section?.querySelectorAll('dt') ?? [])].map((dt) => text(dt))).toEqual(c.rows);
      expect(text(element.querySelector('[data-entitlement] dd'))).toBe(c.value);
      expect(text(element.querySelector('[data-subscription-note]'))).toBe(c.note);
      const link = [...element.querySelectorAll('adm-overview-card a')].find(
        (a) => text(a) === d.platformSubscriptions,
      );
      expect(link?.getAttribute('href')).toBe('/licenses/platforms/school');
      // Membership stays its own card, with the same figures whatever the subscription.
      expect(
        text(element.querySelector('#organization-membership')?.closest('adm-overview-card')),
      ).toContain(d.activeMemberships);
      TestBed.resetTestingModule();
    }
  });

  it('keeps a failed commercial section to itself, with “Try again”', async () => {
    const { element, organizations, commercial, settle } = await render(
      OrganizationDetailPage,
      owner,
      '/platforms/school/organizations/riad',
    );
    organizations.loads[0]?.answer.next(detailOf());
    await settle();
    commercial.loads[0]?.answer.error({ kind: 'unavailable', status: 503 });
    await settle();
    expect(text(element)).toContain(en.organizations.detail.activeMemberships);
    expect(text(element)).toContain(en.organizations.states.sectionUnavailable);
    const retry = [...element.querySelectorAll('button')].find(
      (b) => text(b) === en.organizations.states.retry,
    );
    retry?.click();
    await settle();
    expect(commercial.loads).toHaveLength(2);
  });

  it('shows an Organization of another Platform as not found, linking back to this Platform’s directory', async () => {
    const { element, organizations, settle } = await render(
      OrganizationDetailPage,
      owner,
      '/platforms/school/organizations/riad',
    );
    organizations.loads[0]?.answer.error({ kind: 'not_found', status: 404 });
    await settle();
    expect(text(element.querySelector('h1'))).toBe(en.organizations.states.notFoundTitle);
    expect(element.querySelector('nw-data-state a')?.getAttribute('href')).toBe(
      '/platforms/school/organizations',
    );
  });

  it('gives the breadcrumbs the Organization’s name while shown, and takes it back when destroyed', async () => {
    const { fixture, organizations, settle } = await render(
      OrganizationDetailPage,
      owner,
      '/platforms/school/organizations/riad',
    );
    const label = TestBed.inject(EntityLabel);
    expect(label.labelFor('/platforms/school/organizations/riad')).toBeNull();
    organizations.loads[0]?.answer.next(detailOf());
    await settle();
    expect(label.labelFor('/platforms/school/organizations/riad')).toBe('Collège Riad');
    fixture.destroy();
    expect(label.labelFor('/platforms/school/organizations/riad')).toBeNull();
  });
});
