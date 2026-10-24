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
import { BillingFacade } from '../application/billing.facade';
import { BillingGateway, UnavailableBillingGateway } from '../data-access/billing.gateway';
import {
  BILLING_DEMO_SCENARIO,
  BillingDemoScenario,
  MockBillingGateway,
} from '../data-access/billing.mock';
import { BillingPage } from './billing.page';

const t = en.billing;
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
  }: { gateway?: 'mock' | 'unavailable'; scenario?: BillingDemoScenario } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      BillingPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'billing', component: Blank },
        { path: 'platforms/:platformId', component: Blank },
        { path: 'platforms/:platformId/organizations/:organizationId', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: BILLING_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      {
        provide: BillingGateway,
        useClass: gateway === 'mock' ? MockBillingGateway : UnavailableBillingGateway,
      },
      ScopeContext,
      BillingFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const spy = vi.spyOn(TestBed.inject(BillingGateway), 'followUps');
  await TestBed.inject(Router).navigateByUrl('/billing');
  const fixture = TestBed.createComponent(BillingPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  for (let i = 0; i < 20 && !element.querySelector('nw-data-state, table'); i++) await settle();
  await settle();
  return { element, spy, settle, world: TestBed.inject(DemoWorld) };
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
const rows = (element: HTMLElement) =>
  [...element.querySelectorAll('tbody tr')].map((r) =>
    [...r.querySelectorAll('th, td')].map((c) => text(c)),
  );

describe('Billing & payments page (P7-S3)', { timeout: 15_000 }, () => {
  it('lists the two payment follow-ups, each issue apart from the subscription and entitlement', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(t.header.title);
    expect(text(element.querySelector('.billing__demo'))).toContain(en.shell.demo.badge);
    expect(text(element.querySelector('.billing__note'))).toBe(t.provisional);
    expect(text(element.querySelector('[data-summary]'))).toBe(
      '2 payment follow-ups: 1 failed, 1 awaiting action.',
    );
    expect(rows(element)).toEqual([
      [
        'Collège Riad',
        'Nawara School',
        t.kind.failed,
        t.subscription.active,
        t.entitlement.entitled,
      ],
      [
        'Auto-École du Port',
        'Nawara Drive',
        t.kind.awaitingAction,
        t.subscription.none,
        t.entitlement.notEntitled,
      ],
    ]);
    expect(text(element.querySelector('.billing__hint'))).toBe(t.list.separate);
  });

  it('links each follow-up to its Organization and Platform', async () => {
    const { element } = await render();
    const links = [...element.querySelectorAll('tbody tr')].map((r) =>
      [...r.querySelectorAll('a')].map((a) => a.getAttribute('href')),
    );
    expect(links[0]?.[0]).toMatch(
      new RegExp(`^/platforms/${DEMO_SCHOOL_PLATFORM_ID}/organizations/[0-9a-f-]{36}$`),
    );
    expect(links[0]?.[1]).toBe(`/platforms/${DEMO_SCHOOL_PLATFORM_ID}`);
    expect(links[1]?.[1]).toBe(`/platforms/${DEMO_DRIVE_PLATFORM_ID}`);
  });

  it('filters by issue locally, with the counts in the options, requesting nothing', async () => {
    const { element, settle, spy } = await render();
    const select = element.querySelector<HTMLSelectElement>('select')!;
    expect([...select.options].map((o) => text(o))).toEqual([
      'All (2)',
      'Failed (1)',
      'Awaiting action (1)',
    ]);
    select.value = 'awaiting_action';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(rows(element).map((r) => r[0])).toEqual(['Auto-École du Port']);
    expect(text(element.querySelector('[role="status"]'))).toBe('Showing 1 of 2 follow-ups');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('says what is not available, with no payment operation and no amount anywhere', async () => {
    const { element } = await render();
    expect([...element.querySelectorAll('[data-unavailable] li')].map((li) => text(li))).toEqual([
      t.unavailable.invoices,
      t.unavailable.amounts,
      t.unavailable.settlement,
      t.unavailable.refunds,
      t.unavailable.operations,
      t.unavailable.revenue,
    ]);
    // The only control is the filter: no retry, refund, collect or any other payment action.
    expect(element.querySelectorAll('button, form, [role="dialog"], input')).toHaveLength(0);
    expect(element.querySelectorAll('select')).toHaveLength(1);
    const table = text(element.querySelector('table'));
    expect(table).not.toMatch(/[€$£]|\bTND\b|\bDZD\b|\d[.,]\d{2}\b|invoice|INV-|payment-issue-/i);
  });

  it('never asks an operator’s gateway, whatever their Platform assignments', async () => {
    const { element, spy } = await render(operator);
    expect(spy).not.toHaveBeenCalled();
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.forbiddenDescription);
    expect(element.querySelector('table')).toBeNull();
  });

  it('says it is not available in a build without the mock, and handles error and empty', async () => {
    const unavailable = await render(owner, { gateway: 'unavailable' });
    expect(text(unavailable.element.querySelector('nw-data-state'))).toContain(
      t.states.notInBuildTitle,
    );
    TestBed.resetTestingModule();
    const failing = await render(owner, { scenario: 'error' });
    expect(text(failing.element.querySelector('nw-data-state'))).toContain(t.states.errorTitle);
    failing.element.querySelector<HTMLButtonElement>('nw-data-state button')?.click();
    await failing.settle();
    expect(failing.spy).toHaveBeenCalledTimes(2);
    TestBed.resetTestingModule();
    const empty = await render(owner, { scenario: 'empty' });
    expect(text(empty.element.querySelector('nw-data-state'))).toContain(t.states.emptyTitle);
  });

  it('changes nothing in the world', async () => {
    const { world } = await render();
    expect(world.snapshot()).toEqual(demoWorldSeed(NOW));
  });
});
