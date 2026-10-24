import { Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { vi } from 'vitest';
import en from '../../../../i18n/en.json';
import { Actor } from '../../../core/auth/actor';
import { AuthSession } from '../../../core/auth/auth-session';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { APP_ENVIRONMENT, DemoBindings } from '../../../core/config/app-environment';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { DEMO_WORLD_SEED } from '../../../demo/world/demo-world';
import { AdminIdentityId, DemoWorldTables } from '../../../demo/world/records';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { NW_CLOCK } from '../../../shared/format/clock';
import { OperatorDetailFacade } from '../application/operator-detail.facade';
import { OperatorDirectoryFacade } from '../application/operator-directory.facade';
import {
  OperatorAssignmentGateway,
  UnavailableOperatorAssignmentGateway,
} from '../data-access/operator-assignment.gateway';
import {
  OperatorDirectoryGateway,
  UnavailableOperatorDirectoryGateway,
} from '../data-access/operator-directory.gateway';
import {
  MockOperatorAccountGateway,
  MockOperatorAssignmentGateway,
  MockOperatorDirectoryGateway,
  OPERATOR_ACCOUNT_DEMO_SCENARIO,
  OPERATOR_ASSIGNMENT_DEMO_SCENARIO,
  OperatorAccountDemoScenario,
  OPERATOR_DIRECTORY_DEMO_SCENARIO,
  OperatorAssignmentDemoScenario,
  OperatorDirectoryDemoScenario,
} from '../data-access/operator.mock';
import { OperatorBlockAction } from '../application/operator-block.action';
import { PlatformAccessAction } from '../application/platform-access.action';
import { OperatorCreateAction } from '../application/operator-create.action';
import {
  OperatorAccountGateway,
  UnavailableOperatorAccountGateway,
} from '../data-access/operator-account.gateway';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';

/** Test-only: the operator pages over the demo world, signed in as a given actor. Imported by specs and nothing else. */

export const SCHOOL = DEMO_SCHOOL_PLATFORM_ID;
export const DRIVE = DEMO_DRIVE_PLATFORM_ID;

@Component({ template: '' })
export class Blank {}

export const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_ID,
  email: 'owner@x.invalid',
  companyId: DEMO_COMPANY_ID,
};

export const operatorOf = (id: AdminIdentityId, assignments = [SCHOOL]): Actor => ({
  kind: 'operator',
  userId: id,
  email: 'p@x.invalid',
  platformAssignments: assignments,
});

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
    services: [],
    releases: [],
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

export interface RenderOptions {
  /** `mock`: the demo adapters; `unavailable`: a build without demo data. */
  readonly directory?: 'mock' | 'unavailable';
  readonly history?: 'mock' | 'unavailable';
  readonly scenario?: OperatorDirectoryDemoScenario;
  /** How Platform access changes are answered (P6-S2). */
  readonly changes?: OperatorAssignmentDemoScenario;
  /** How block, unblock (P6-S3) and creation (P6-S4) are answered. */
  readonly account?: OperatorAccountDemoScenario;
  /** `unavailable`: a build without the account mock (nothing can be created, blocked or unblocked). */
  readonly accountGateway?: 'mock' | 'unavailable';
  /** Navigation state the page is opened with (P6-S4: the id of an operator just created). */
  readonly state?: Record<string, unknown>;
  /** The world to start from instead of the canonical seed. */
  readonly seed?: (now: number) => DemoWorldTables;
  readonly latency?: number;
}

export async function renderOperators<T>(
  page: Type<T>,
  actor: Actor,
  identity: AdminIdentityId,
  url: string,
  {
    directory = 'mock',
    history = 'mock',
    scenario = 'normal',
    changes = 'normal',
    account = 'normal',
    accountGateway = 'mock',
    state,
    seed,
    latency = 0,
  }: RenderOptions = {},
) {
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
        { path: 'operators/:operatorId', component: Blank },
        { path: 'operators', component: Blank },
        { path: 'platforms/:platformId', component: Blank },
      ]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: latency },
      ...(seed === undefined ? [] : [{ provide: DEMO_WORLD_SEED, useValue: seed }]),
      { provide: OPERATOR_ASSIGNMENT_DEMO_SCENARIO, useValue: changes },
      { provide: StepUpGateway, useClass: MockStepUpGateway },
      { provide: NW_CLOCK, useValue: () => Date.parse('2026-10-23T12:00:00Z') },
      { provide: OPERATOR_DIRECTORY_DEMO_SCENARIO, useValue: scenario },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      {
        provide: OperatorDirectoryGateway,
        useClass:
          directory === 'mock' ? MockOperatorDirectoryGateway : UnavailableOperatorDirectoryGateway,
      },
      {
        provide: OperatorAssignmentGateway,
        useClass:
          history === 'mock' ? MockOperatorAssignmentGateway : UnavailableOperatorAssignmentGateway,
      },
      ScopeContext,
      OperatorDirectoryFacade,
      OperatorDetailFacade,
      PlatformAccessAction,
      OperatorBlockAction,
      OperatorCreateAction,
      { provide: OPERATOR_ACCOUNT_DEMO_SCENARIO, useValue: account },
      {
        provide: OperatorAccountGateway,
        useClass:
          accountGateway === 'mock'
            ? MockOperatorAccountGateway
            : UnavailableOperatorAccountGateway,
      },
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  TestBed.inject(DemoAuthState).signedIn.set({
    identity: { userId: actor.userId, email: actor.email, phone: null, adminTier: actor.kind },
    businessIdentityId: identity,
  });
  const listSpy = vi.spyOn(TestBed.inject(OperatorDirectoryGateway), 'list');
  const loadSpy = vi.spyOn(TestBed.inject(OperatorDirectoryGateway), 'load');
  const historySpy = vi.spyOn(TestBed.inject(OperatorAssignmentGateway), 'history');
  const grantSpy = vi.spyOn(TestBed.inject(OperatorAssignmentGateway), 'grant');
  const revokeSpy = vi.spyOn(TestBed.inject(OperatorAssignmentGateway), 'revoke');
  const blockSpy = vi.spyOn(TestBed.inject(OperatorAccountGateway), 'block');
  const unblockSpy = vi.spyOn(TestBed.inject(OperatorAccountGateway), 'unblock');
  const createSpy = vi.spyOn(TestBed.inject(OperatorAccountGateway), 'create');
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url, state === undefined ? {} : { state });
  const fixture = TestBed.createComponent(page);
  const settle = async (ms = 5) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  const element = fixture.nativeElement as HTMLElement;
  for (let i = 0; i < 20 && !element.querySelector('h1'); i++) await settle(10);
  await settle(10);
  return {
    element,
    router,
    settle,
    listSpy,
    loadSpy,
    historySpy,
    grantSpy,
    revokeSpy,
    blockSpy,
    unblockSpy,
    createSpy,
  };
}

/** The visible text of an element, without the isolation marks and with spaces collapsed. */
export const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
