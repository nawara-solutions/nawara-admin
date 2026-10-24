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
import { AdminIdentityId } from '../../../demo/world/records';
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
  MockOperatorAssignmentGateway,
  MockOperatorDirectoryGateway,
  OPERATOR_DIRECTORY_DEMO_SCENARIO,
  OperatorDirectoryDemoScenario,
} from '../data-access/operator.mock';

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

export interface RenderOptions {
  /** `mock`: the demo adapters; `unavailable`: a build without demo data. */
  readonly directory?: 'mock' | 'unavailable';
  readonly history?: 'mock' | 'unavailable';
  readonly scenario?: OperatorDirectoryDemoScenario;
}

export async function renderOperators<T>(
  page: Type<T>,
  actor: Actor,
  identity: AdminIdentityId,
  url: string,
  { directory = 'mock', history = 'mock', scenario = 'normal' }: RenderOptions = {},
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
      { provide: DEMO_LATENCY_MS, useValue: 0 },
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
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(page);
  const settle = async (ms = 5) => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await fixture.whenStable();
  };
  const element = fixture.nativeElement as HTMLElement;
  for (let i = 0; i < 20 && !element.querySelector('h1'); i++) await settle(10);
  await settle(10);
  return { element, router, settle, listSpy, loadSpy, historySpy };
}

/** The visible text of an element, without the isolation marks and with spaces collapsed. */
export const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/[⁨⁩]/g, '').replace(/\s+/g, ' ').trim() ?? '';
