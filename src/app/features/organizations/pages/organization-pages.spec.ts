import { Dialog } from '@angular/cdk/dialog';
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
  subscriptionFixture,
  detailOf,
  directoryOf,
  operator,
  owner,
} from '../testing/organizations-testing';
import { organizationActionTestProviders } from '../testing/organization-actions-testing';
import { OrganizationDetailPage } from './organization-detail.page';
import { OrganizationDirectoryPage } from './organization-directory.page';
import { MembershipActionLock } from '../application/membership-action-support';
import { MembershipDecisionAction } from '../application/membership-decision.action';
import { MembershipRevokeAction } from '../application/membership-revoke.action';
import { OrganizationAdminRoleAction } from '../application/organization-admin-role.action';
import { OrganizationMembersFacade } from '../application/organization-members.facade';
import { MembershipGateway, UnavailableMembershipGateway } from '../data-access/membership.gateway';

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
      // The detail page embeds the members page (PR #89): the detail route's members providers, with
      // the Membership gateway unavailable (the members list is not under test here).
      { provide: MembershipGateway, useClass: UnavailableMembershipGateway },
      OrganizationMembersFacade,
      MembershipActionLock,
      MembershipDecisionAction,
      MembershipRevokeAction,
      OrganizationAdminRoleAction,
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

/** PR #89: the directory's filters are in a popup opened by "Filters"; the radio groups it offers, by name. */
async function filterGroups(element: HTMLElement, settle: () => Promise<void>) {
  const open = [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.trim().startsWith(en.operators.filters.title),
  );
  open?.click();
  await settle();
  const radios = [
    ...document.querySelectorAll<HTMLInputElement>(
      'adm-organization-filter-dialog input[type="radio"]',
    ),
  ];
  const names = [...new Set(radios.map((r) => r.name))];
  const checked = radios.filter((r) => r.checked).map((r) => `${r.name}=${r.value}`);
  open?.click();
  await settle();
  return { names, checked };
}

/** PR #89: the details, commercial section and activity are in the side panel "Overview" opens. */
async function openOverview(element: HTMLElement, settle: () => Promise<void>) {
  [...element.querySelectorAll<HTMLButtonElement>('.organization-detail__header button')]
    .find((b) => b.textContent?.trim() === en.organizations.detail.overview)
    ?.click();
  await settle();
  return document.querySelector<HTMLElement>('adm-organization-details-panel');
}

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

  it('shows each Organization’s assisted payments as eligibility not verified, never a policy (WP-2.2)', async () => {
    const { element, organizations, commercial, settle } = await render(
      OrganizationDirectoryPage,
      owner,
      '/platforms/school/organizations',
    );
    organizations.lists[0]?.answer.next(directoryOf());
    commercial.lists[0]?.answer.next(commercialListOf());
    await settle();
    const cells = [...element.querySelectorAll('[data-eligibility]')].map((cell) => text(cell));
    expect(cells).toEqual([
      en.organizations.eligibility.notVerified,
      en.organizations.eligibility.notVerified,
      en.organizations.eligibility.notVerified,
    ]);
    const table = text(element.querySelector('.organization-table__table tbody'));
    expect(table).toContain(en.organizations.eligibility.source);
    expect(table).not.toMatch(/\b(enabled|disabled|inherited|eligible)\b/i);
    // The subscription column is unchanged.
    expect(text(element.querySelectorAll('.organization-table__table tbody tr')[1])).toContain(
      'Ends in 6 days',
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
    // The filters offer an operator the requests filter only, never a subscription filter.
    expect((await filterGroups(element, settle)).names).toEqual(['requests']);
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
    // The URL's requests=1 is the active filter: marked on "Filters" and checked in its popup.
    expect(element.querySelector('.organization-directory__filter-dot')).not.toBeNull();
    expect((await filterGroups(element, settle)).checked).toContain('requests=true');
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
    // The approved PR #89 layout: the page's figures and members, the rest in the "Overview" side panel.
    const d = en.organizations.detail;
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
    // The owner's figures: memberships, requests and awaiting invitations.
    expect(
      [...element.querySelectorAll('.organization-detail__summary-totals dt')].map((dt) =>
        text(dt),
      ),
    ).toEqual([d.memberships, d.requests, d.invitations]);
    const panel = (await openOverview(element, settle))!;
    expect(text(panel)).toContain(en.organizations.activity.adminInvitationCreated);
    // About: the Platform, the ID left to right, the creation date, and only the optional fields given.
    const about = panel.querySelector('#organization-details-about')!;
    const labels = [...about.querySelectorAll('dt')].map((dt) => text(dt));
    expect(labels).toEqual(expect.arrayContaining([d.platform, d.organizationId, d.createdAt]));
    expect(labels).toContain(d.type);
    expect(labels).toContain(d.phone);
    expect(labels).not.toContain(d.taxCode);
    expect(labels).not.toContain(d.address);
    expect(about.querySelector('a')?.getAttribute('href')).toBe('/platforms/school');
    expect(about.querySelector('code')?.getAttribute('dir')).toBe('ltr');
    const phone = [...about.querySelectorAll('bdi')].find((b) => text(b) === '+213 21 00 00');
    expect(phone?.getAttribute('dir')).toBe('ltr');
    // A build without the command: Edit details is shown disabled, with its reason.
    const edit = [...panel.querySelectorAll('button')].find(
      (b) => text(b) === en.organizations.edit.open,
    );
    expect(edit?.getAttribute('aria-disabled')).toBe('true');
    expect(text(panel.querySelector(`#${edit?.getAttribute('aria-describedby')}`))).toBe(
      en.organizations.edit.notInBuildReason,
    );
    // The commercial section is the panel's Payments tab.
    expect(panel.querySelector('#organization-details-tab-payments')).not.toBeNull();
    // No lifecycle status is invented.
    expect(`${text(element)} ${text(panel)}`.toLowerCase()).not.toMatch(
      /\b(suspended|archived|provisioned)\b/,
    );
  });

  it('links the owner’s activity card to the activity browser with this Organization preselected (P8-S1)', async () => {
    const { element, organizations, settle } = await render(
      OrganizationDetailPage,
      owner,
      '/platforms/school/organizations/riad',
    );
    organizations.loads[0]?.answer.next(detailOf());
    await settle();
    // The panel's Activity section links to the browser, this Organization preselected.
    const panel = await openOverview(element, settle);
    const link = panel?.querySelector('a.activity-link');
    expect(text(link)).toBe(en.organizations.detail.openActivity);
    expect(link?.getAttribute('href')).toBe('/audit?platform=school&organization=riad');
  });

  it('shows an operator the hierarchy facts only', async () => {
    const d = en.organizations.detail;
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
    // Memberships and requests only: no invitations (Core refuses operators them).
    expect(
      [...element.querySelectorAll('.organization-detail__summary-totals dt')].map((dt) =>
        text(dt),
      ),
    ).toEqual([d.memberships, d.requests]);
    expect(
      [...element.querySelectorAll('button')].some(
        (b) => text(b) === en.organizations.invitations.view,
      ),
    ).toBe(false);
    // The panel: About only, no Payments tab, no Activity and no activity browser link.
    const panel = (await openOverview(element, settle))!;
    expect(panel.querySelector('#organization-details-about')).not.toBeNull();
    expect(panel.querySelector('#organization-details-tab-payments')).toBeNull();
    expect(panel.querySelector('a.activity-link')).toBeNull();
    expect(text(panel)).not.toContain(d.activity);
  });

  it('shows the subscription, its timeline and the entitlement as separate rows, per state (P7-S2)', async () => {
    const d = en.organizations.detail;
    const L = en.subscriptionLifecycle.detail;
    const HOUR = 3_600_000;
    // The panel's Payments tab (PR #89, lifecycle rows from WP-4.1); the entitlement stays its own row.
    const timeline = [d.subscriptionState, L.periodStart, L.periodEnd, L.graceUntil, d.entitledNow];
    const cases = [
      {
        subscription: subscriptionFixture(new Date(NOW + 6 * 24 * HOUR).toISOString()),
        entitlement: 'entitled',
        rows: [...timeline, L.storedStatus],
        value: en.organizations.entitlement.entitled,
        note: d.activeNote,
      },
      {
        subscription: subscriptionFixture(
          new Date(NOW - 6 * HOUR).toISOString(),
          new Date(NOW + 18 * HOUR).toISOString(),
        ),
        entitlement: 'entitledInGrace',
        rows: [...timeline, L.storedStatus],
        value: en.organizations.entitlement.entitledInGrace,
        note: d.graceNote,
      },
      {
        subscription: subscriptionFixture(null),
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
      const panel = (await openOverview(element, settle))!;
      panel.querySelector<HTMLButtonElement>('#organization-details-tab-payments')!.click();
      await settle();
      const payments = panel.querySelector('#organization-details-payments')!;
      const section = payments.querySelector('section.details')!;
      const rows = [...section.querySelectorAll(':scope > dl > div')];
      expect(
        rows.map((r) => text(r.querySelector('dt'))),
        c.entitlement,
      ).toEqual(c.rows);
      const entitled = rows.find((r) => text(r.querySelector('dt')) === d.entitledNow);
      expect(text(entitled?.querySelector('dd')), c.entitlement).toBe(c.value);
      expect(text(section.querySelector('.subscription-note')), c.entitlement).toBe(c.note);
      // The way to the Platform's subscriptions.
      const link = [...panel.querySelectorAll('a')].find(
        (a) => text(a) === d.platformSubscriptions,
      );
      expect(link?.getAttribute('href')).toBe('/licenses/platforms/school');
      // Membership stays on the page, whatever the subscription.
      expect(text(element.querySelector('.organization-detail__summary-totals'))).toContain(
        d.memberships,
      );
      TestBed.inject(Dialog).closeAll();
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
    // The page keeps its membership figures; the panel's commercial section alone is unavailable, with "Try again".
    expect(text(element)).toContain(en.organizations.detail.memberships);
    const panel = await openOverview(element, settle);
    panel?.querySelector<HTMLButtonElement>('#organization-details-tab-payments')?.click();
    await settle();
    expect(text(panel)).toContain(en.organizations.states.sectionUnavailable);
    const retry = [...(panel?.querySelectorAll('button') ?? [])].find(
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
