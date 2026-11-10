import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
  demoWorldSeed,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { LicensesFacade } from '../application/licenses.facade';
import { LicensesGateway, UnavailableLicensesGateway } from '../data-access/licenses.gateway';
import {
  LICENSES_DEMO_SCENARIO,
  LicensesDemoScenario,
  MockLicensesGateway,
} from '../data-access/licenses.mock';
import { LicensesPage } from './licenses.page';

const t = en.licenses;
const NOW = Date.parse('2026-10-23T12:00:00Z');

@Component({ template: '' })
class Blank {}

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: DEMO_OPERATOR_IDS.multi,
  email: 'p@x.invalid',
  platformAssignments: [DEMO_SCHOOL_PLATFORM_ID, DEMO_DRIVE_PLATFORM_ID],
};

async function render(
  actor: Actor = owner,
  {
    gateway = 'mock',
    scenario = 'normal',
  }: { gateway?: 'mock' | 'unavailable'; scenario?: LicensesDemoScenario } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      LicensesPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'licenses', component: Blank },
        { path: 'licenses/platforms/:platformId', component: Blank },
        { path: 'platforms/:platformId/organizations/:organizationId', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: LICENSES_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      {
        provide: LicensesGateway,
        useClass: gateway === 'mock' ? MockLicensesGateway : UnavailableLicensesGateway,
      },
      ScopeContext,
      LicensesFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const overviewSpy = vi.spyOn(TestBed.inject(LicensesGateway), 'overview');
  await TestBed.inject(Router).navigateByUrl('/licenses');
  const fixture = TestBed.createComponent(LicensesPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  for (let i = 0; i < 20 && !element.querySelector('nw-data-state, .licenses__figures'); i++)
    await settle();
  await settle();
  return { element, overviewSpy, settle, world: TestBed.inject(DemoWorld) };
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';

describe('Licenses & entitlements page (P7-S1)', { timeout: 15_000 }, () => {
  it('shows the Company figures from the demo world, grace apart from active, entitlement apart from both', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(t.header.title);
    expect(text(element.querySelector('.licenses__figure-total strong'))).toBe('24');
    expect([...element.querySelectorAll('.licenses__figure-legend li')].map(text)).toEqual([
      `${t.figures.active} 20`,
      `${t.figures.grace} 1`,
      `${t.figures.none} 3`,
      `${t.figures.endingSoon} 8`,
      `${t.figures.organizations} 24`,
    ]);
    expect(text(element.querySelector('.licenses__demo'))).toContain(en.shell.demo.badge);
  });

  it('lists each Platform, linked to its Organization subscriptions, with its own Personal Premium count beside the subscriptions', async () => {
    const { element } = await render();
    const rows = [...element.querySelectorAll('tbody tr')].map((r) =>
      [...r.querySelectorAll('th, td')].map((c) => text(c)),
    );
    expect(rows).toEqual([
      ['Nawara School', '16', '13', '1', '2', '5', '14', '21'],
      ['Nawara Drive', '8', '7', '0', '1', '3', '7', '9'],
    ]);
    expect([...element.querySelectorAll('tbody th a')].map((a) => a.getAttribute('href'))).toEqual([
      `/licenses/platforms/${DEMO_SCHOOL_PLATFORM_ID}`,
      `/licenses/platforms/${DEMO_DRIVE_PLATFORM_ID}`,
    ]);
  });

  it('lists what needs attention, linked to each Organization', async () => {
    const { element, settle } = await render();
    element.querySelector<HTMLButtonElement>('.licenses__attention-link')!.click();
    await settle();
    expect(document.querySelectorAll('.attention-list__item')).toHaveLength(5);
    const pageButtons = () =>
      document.querySelectorAll<HTMLButtonElement>('.attention-pagination__buttons button');
    pageButtons()[1]!.click();
    await settle();
    expect(document.querySelectorAll('.attention-list__item')).toHaveLength(4);
    const pageSize = document.querySelector<HTMLSelectElement>(
      '.attention-pagination__size select',
    )!;
    pageSize.value = '10';
    pageSize.dispatchEvent(new Event('change'));
    await settle();
    const items = [...document.querySelectorAll('.attention-list__item')];
    expect(items.map((i) => i.getAttribute('data-attention'))).toEqual([
      'graceEnds',
      'ends',
      'ends',
      'ends',
      'ends',
      'ends',
      'ends',
      'ends',
      'ends',
    ]);
    expect(text(items[0]?.querySelector('a'))).toBe('Lycée Al Amal');
    expect(text(items[0]?.querySelector('.attention-list__name span'))).toBe('Nawara School');
    expect(items[0]?.querySelector('a')?.getAttribute('href')).toMatch(
      new RegExp(`^/platforms/${DEMO_SCHOOL_PLATFORM_ID}/organizations/[0-9a-f-]{36}$`),
    );
    expect(text(items[1])).toContain('Ends in 2 days');
    const filter = document.querySelector<HTMLSelectElement>('.attention-control select')!;
    filter.value = 'graceEnds';
    filter.dispatchEvent(new Event('change'));
    await settle();
    expect(document.querySelectorAll('.attention-list__item')).toHaveLength(1);
    filter.value = 'all';
    filter.dispatchEvent(new Event('change'));
    const sort = document.querySelectorAll<HTMLSelectElement>('.attention-control select')[1]!;
    sort.value = 'latest';
    sort.dispatchEvent(new Event('change'));
    await settle();
    expect(text(document.querySelector('.attention-list__item a'))).toBe('Auto-École Médina');
    filter.value = 'within7';
    filter.dispatchEvent(new Event('change'));
    await settle();
    expect(document.querySelectorAll('.attention-list__item')).toHaveLength(4);
    filter.value = 'within14';
    filter.dispatchEvent(new Event('change'));
    await settle();
    expect(document.querySelectorAll('.attention-list__item')).toHaveLength(8);
    pageSize.value = '50';
    pageSize.dispatchEvent(new Event('change'));
    await settle();
    expect(document.querySelectorAll('.attention-list__item')).toHaveLength(8);
  });

  it('opens row actions, shows the real expiry, and copies the organization ID', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      const { element, settle } = await render();
      element.querySelector<HTMLButtonElement>('.licenses__attention-link')!.click();
      await settle();
      const rows = document.querySelectorAll<HTMLElement>('.attention-list__item');
      rows[0]!.querySelector<HTMLButtonElement>('.attention-list__menu-trigger')!.click();
      await settle();
      expect(text(document.querySelector('nw-menu'))).toContain(t.attention.viewOrganization);
      expect(text(document.querySelector('nw-menu'))).not.toContain(t.attention.viewExpiry);
      const copyButton = [...document.querySelectorAll<HTMLButtonElement>('nw-menu button')].find(
        (b) => text(b).includes(t.attention.copyId),
      )!;
      copyButton.click();
      await settle();
      expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f-]{36}$/));
      expect(text(document.querySelector('.attention-feedback'))).toBe(t.attention.copied);
      rows[1]!.querySelector<HTMLButtonElement>('.attention-list__menu-trigger')!.click();
      await settle();
      [...document.querySelectorAll<HTMLButtonElement>('nw-menu button')]
        .find((b) => text(b).includes(t.attention.viewExpiry))!
        .click();
      await settle();
      expect(text(rows[1]!.querySelector('.attention-list__details'))).toContain(
        t.attention.expiresAt,
      );
      expect(text(rows[1]!.querySelector('.attention-list__details'))).toContain(t.meaning.active);
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('navigates to the selected organization and closes the dialog', async () => {
    const { element, settle } = await render();
    element.querySelector<HTMLButtonElement>('.licenses__attention-link')!.click();
    await settle();
    const row = document.querySelector<HTMLElement>('.attention-list__item')!;
    const expected = row.querySelector('a')!.getAttribute('href');
    row.querySelector<HTMLButtonElement>('.attention-list__menu-trigger')!.click();
    await settle();
    [...document.querySelectorAll<HTMLButtonElement>('nw-menu button')]
      .find((button) => text(button).includes(t.attention.viewOrganization))!
      .click();
    await settle();
    expect(TestBed.inject(Router).url).toBe(expected);
    expect(document.querySelector('adm-licenses-attention-dialog')).toBeNull();
  });

  it('says what is not available in one short section, with no control of any kind', async () => {
    const { element } = await render();
    expect([...element.querySelectorAll('[data-unavailable] li')].map((li) => text(li))).toEqual([
      t.unavailable.plans,
      t.unavailable.allocation,
      t.unavailable.changes,
      t.unavailable.revenue,
    ]);
    expect(element.querySelectorAll('input, select, form, [role="dialog"]').length).toBe(0);
    // No invented commercial value: no currency, price or seat figure anywhere.
    expect(text(element)).not.toMatch(/[€$£]|\bTND\b|\bseats?\b(?! allocation)/i);
  });

  it('never asks an operator’s gateway, whatever their Platform assignments', async () => {
    const { element, overviewSpy } = await render(operator);
    expect(overviewSpy).not.toHaveBeenCalled();
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.forbiddenDescription);
    expect(element.querySelector('.licenses__figures')).toBeNull();
  });

  it('says it is not available in a build without the mock, never showing a figure', async () => {
    const { element } = await render(owner, { gateway: 'unavailable' });
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.notInBuildTitle);
    expect(element.querySelector('.licenses__figures')).toBeNull();
  });

  it('offers a retry after an error, and says when there is no Organization', async () => {
    const failing = await render(owner, { scenario: 'error' });
    expect(text(failing.element.querySelector('nw-data-state'))).toContain(t.states.errorTitle);
    const retry = failing.element.querySelector<HTMLButtonElement>('nw-data-state button');
    expect(text(retry)).toBe(t.states.retry);
    retry?.click();
    await failing.settle();
    expect(failing.overviewSpy).toHaveBeenCalledTimes(2);
    TestBed.resetTestingModule();
    const empty = await render(owner, { scenario: 'empty' });
    expect(text(empty.element.querySelector('nw-data-state'))).toContain(t.states.emptyTitle);
  });

  it('changes nothing in the world', async () => {
    const { world } = await render();
    expect(world.snapshot()).toEqual(demoWorldSeed(NOW));
  });
});
