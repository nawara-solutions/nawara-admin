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
import { blockOperator } from '../../../demo/world/commands/operator.commands';
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
import { ActivityFacade } from '../application/activity.facade';
import { ActivityGateway, UnavailableActivityGateway } from '../data-access/activity.gateway';
import {
  ACTIVITY_DEMO_SCENARIO,
  ActivityDemoScenario,
  MockActivityGateway,
} from '../data-access/activity.mock';
import { ActivityPage } from './activity.page';

const t = en.activity;
const NOW = Date.parse('2026-10-23T12:00:00Z');
const SEED = demoWorldSeed(NOW);
const idOf = (name: string) => SEED.organizations.find((o) => o.name === name)!.id;
const RIAD = idOf('Collège Riad');

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
  url = '/audit',
  actor: Actor = owner,
  {
    gateway = 'mock',
    scenario = 'normal',
    blocked = false,
  }: { gateway?: 'mock' | 'unavailable'; scenario?: ActivityDemoScenario; blocked?: boolean } = {},
) {
  TestBed.configureTestingModule({
    imports: [
      ActivityPage,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([
        { path: 'audit', component: Blank },
        { path: 'operators/:operatorId', component: Blank },
        { path: 'platforms/:platformId', component: Blank },
        { path: 'platforms/:platformId/organizations/:organizationId', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: () => Promise.reject(new Error('unused')) } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => NOW },
      { provide: ACTIVITY_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      {
        provide: ActivityGateway,
        useClass: gateway === 'mock' ? MockActivityGateway : UnavailableActivityGateway,
      },
      ScopeContext,
      ActivityFacade,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: actor.userId as AdminIdentityId,
  });
  const world = TestBed.inject(DemoWorld);
  if (blocked)
    world.commit(
      blockOperator({
        actor: DEMO_OWNER_ID,
        operatorId: DEMO_OPERATOR_IDS.school,
        now: NOW - 3_600_000,
      }),
    );
  const spy = vi.spyOn(TestBed.inject(ActivityGateway), 'activity');
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(ActivityPage);
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await fixture.whenStable();
  };
  for (let i = 0; i < 20 && !element.querySelector('nw-data-state, [data-company]'); i++)
    await settle();
  await settle();
  return { element, spy, router, settle, world };
}

const text = (e: Element | null | undefined) =>
  e?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
const scoped = (element: HTMLElement) =>
  [...element.querySelectorAll('#activity-list li')].map((li) => ({
    scope: li.getAttribute('data-scope'),
    action: text(li.querySelector('.activity__action')),
    where: text(li.querySelector('.activity__where')),
  }));
const select = async (
  element: HTMLElement,
  settle: () => Promise<void>,
  index: number,
  value: string,
) => {
  const control = element.querySelectorAll<HTMLSelectElement>('select')[index]!;
  control.value = value;
  control.dispatchEvent(new Event('change'));
  await settle();
};

describe('Audit log: simulated administrative activity (P8-S1)', { timeout: 15_000 }, () => {
  it('lists every Platform and Organization event newest first, and Company activity apart', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(t.header.title);
    expect(scoped(element)).toEqual([
      {
        scope: 'organization',
        action: t.actions.organizationCreated,
        where: expect.stringMatching(/^Organization · .+ · Nawara School$/),
      },
      {
        scope: 'organization',
        action: t.actions.membershipApproved,
        where: expect.stringMatching(/ · Nawara Drive$/),
      },
      {
        scope: 'organization',
        action: t.actions.adminInvitationCreated,
        where: 'Organization · Collège Riad · Nawara School',
      },
      {
        scope: 'organization',
        action: t.actions.membershipApproved,
        where: expect.stringMatching(/ · Nawara School$/),
      },
      { scope: 'platform', action: t.actions.operatorAssigned, where: 'Platform · Nawara School' },
      {
        scope: 'organization',
        action: t.actions.adminInvitationCreated,
        where: expect.stringMatching(/ · Nawara Drive$/),
      },
      {
        scope: 'organization',
        action: t.actions.organizationCreated,
        where: expect.stringMatching(/ · Nawara Drive$/),
      },
    ]);
    expect(text(element.querySelector('[role="status"]'))).toBe('Matching events: 7');
    expect(text(element.querySelector('[data-company]'))).toContain(t.company.none);
    for (const time of element.querySelectorAll('#activity-list time'))
      expect(time.getAttribute('datetime')).toMatch(/Z$/);
  });

  it('shows Company events only in their own section, linked to the operator by id', async () => {
    const { element } = await render('/audit', owner, { blocked: true });
    expect(scoped(element).some((e) => e.scope === 'company')).toBe(false);
    const company = element.querySelector('[data-company]');
    expect(text(company?.querySelector('.activity__action'))).toBe(t.actions.operatorBlocked);
    expect(company?.querySelector('a')?.getAttribute('href')).toBe(
      `/operators/${DEMO_OPERATOR_IDS.school}`,
    );
    expect(text(company)).not.toMatch(/@|demo\.nawara/);
  });

  it('keeps the simulated-activity note visible in every state', async () => {
    const note = (element: HTMLElement) => text(element.querySelector('[data-simulated]'));
    const expected = `${t.simulated.title} ${t.simulated.body}`;
    expect(note((await render()).element)).toBe(expected);
    for (const options of [
      { scenario: 'error' as const },
      { scenario: 'empty' as const },
      { gateway: 'unavailable' as const },
    ]) {
      TestBed.resetTestingModule();
      expect(note((await render('/audit', owner, options)).element)).toBe(expected);
    }
    TestBed.resetTestingModule();
    expect(note((await render('/audit', operator)).element)).toBe(expected);
    TestBed.resetTestingModule();
    expect(
      note(
        (await render(`/audit?platform=${DEMO_SCHOOL_PLATFORM_ID}&organization=${RIAD}`)).element,
      ),
    ).toBe(expected);
  });

  it('filters by Platform, then Organization, through the URL; an Organization keeps only its own events', async () => {
    const { element, router, settle } = await render('/audit', owner, { blocked: true });
    await select(element, settle, 0, DEMO_SCHOOL_PLATFORM_ID);
    expect(router.url).toBe(`/audit?platform=${DEMO_SCHOOL_PLATFORM_ID}`);
    expect(scoped(element).map((e) => e.scope)).toEqual([
      'organization',
      'organization',
      'organization',
      'platform',
    ]);
    // Company events belong to no Platform: not shown for a selection, never mixed in.
    expect(text(element.querySelector('[data-company]'))).toContain(t.company.notInScope);
    await select(element, settle, 1, RIAD);
    expect(router.url).toBe(`/audit?platform=${DEMO_SCHOOL_PLATFORM_ID}&organization=${RIAD}`);
    // Only the event that names Collège Riad: never its Platform's operator assignment.
    expect(scoped(element)).toEqual([
      {
        scope: 'organization',
        action: t.actions.adminInvitationCreated,
        where: 'Organization · Collège Riad · Nawara School',
      },
    ]);
    // Changing the Platform clears the Organization.
    await select(element, settle, 0, DEMO_DRIVE_PLATFORM_ID);
    expect(router.url).toBe(`/audit?platform=${DEMO_DRIVE_PLATFORM_ID}`);
    expect(scoped(element)).toHaveLength(3);
  });

  it('opens an Organization’s entry with it preselected, and leads back to the Organization', async () => {
    const { element } = await render(
      `/audit?platform=${DEMO_SCHOOL_PLATFORM_ID}&organization=${RIAD}`,
      owner,
      { blocked: true },
    );
    const selects = [...element.querySelectorAll<HTMLSelectElement>('select')];
    expect(selects[0]?.value).toBe(DEMO_SCHOOL_PLATFORM_ID);
    expect(selects[1]?.value).toBe(RIAD);
    expect(scoped(element)).toHaveLength(1);
    expect(text(element.querySelector('[data-context]'))).toContain('Collège Riad · Nawara School');
    expect(element.querySelector('[data-context] a')?.getAttribute('href')).toBe(
      `/platforms/${DEMO_SCHOOL_PLATFORM_ID}/organizations/${RIAD}`,
    );
    expect(element.querySelector('[data-company] li')).toBeNull();
  });

  it('filters by action, and says when nothing matches', async () => {
    const { element, settle } = await render();
    await select(element, settle, 2, 'membership.approved');
    expect(scoped(element).map((e) => e.action)).toEqual([
      t.actions.membershipApproved,
      t.actions.membershipApproved,
    ]);
    await select(element, settle, 2, 'membership.revoked');
    expect(text(element.querySelector('[data-no-match] p'))).toBe(t.scoped.none);
    element.querySelector<HTMLButtonElement>('[data-no-match] button')!.click();
    await settle();
    expect(scoped(element)).toHaveLength(7);
  });

  it('never matches a Platform or Organization the Company does not have', async () => {
    const { element } = await render(
      '/audit?platform=5b8d2a10-0000-4000-8000-000000000000&organization=x',
    );
    expect(text(element.querySelector('[data-unknown] p'))).toBe(t.filters.unknown);
    expect(element.querySelector('#activity-list')).toBeNull();
  });

  it('offers no export, download or change, and shows no audit-only field', async () => {
    const { element } = await render('/audit', owner, { blocked: true });
    expect(
      element.querySelectorAll('button, form, [role="dialog"], input, [download]'),
    ).toHaveLength(0);
    expect(element.querySelectorAll('select')).toHaveLength(3);
    const lists =
      text(element.querySelector('#activity-list')) +
      text(element.querySelector('[data-company] ol'));
    expect(lists).not.toMatch(
      /\b(IP|signature|hash|correlation|outcome|before|after|export|download|platform-activity|operator-activity)\b/i,
    );
    expect([...element.querySelectorAll('[data-not] li')].map((li) => text(li))).toEqual([
      t.not.evidence,
      t.not.complete,
      t.not.fields,
      t.not.export,
      t.not.core,
    ]);
  });

  it('never asks an operator’s gateway, whatever their Platform assignments', async () => {
    const { element, spy } = await render('/audit', operator);
    expect(spy).not.toHaveBeenCalled();
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.forbiddenDescription);
    expect(element.querySelector('#activity-list')).toBeNull();
  });

  it('says it is not available in a build without the mock, and handles error and empty', async () => {
    const unavailable = await render('/audit', owner, { gateway: 'unavailable' });
    expect(text(unavailable.element.querySelector('nw-data-state'))).toContain(
      t.states.notInBuildTitle,
    );
    TestBed.resetTestingModule();
    const failing = await render('/audit', owner, { scenario: 'error' });
    failing.element.querySelector<HTMLButtonElement>('nw-data-state button')?.click();
    await failing.settle();
    expect(failing.spy).toHaveBeenCalledTimes(2);
    TestBed.resetTestingModule();
    const empty = await render('/audit', owner, { scenario: 'empty' });
    expect(text(empty.element.querySelector('nw-data-state'))).toContain(t.states.emptyTitle);
  });

  it('changes nothing in the world', async () => {
    const { world } = await render();
    expect(world.snapshot()).toEqual(demoWorldSeed(NOW));
  });
});
