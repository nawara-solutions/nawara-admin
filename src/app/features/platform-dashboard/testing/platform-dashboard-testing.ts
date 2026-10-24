import { Component } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { Actor } from '../../../core/auth/actor';
import { DemoBindings } from '../../../core/config/app-environment';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  CompanyDirectory,
  PlatformId,
  PlatformRef,
  companyId,
  organizationId,
  platformId,
} from '../../../core/context/scope.model';
import { Metric } from '../../../shared/dashboard/metric';
import { PlatformCommercialGateway } from '../data-access/platform-commercial.gateway';
import { PlatformDashboardGateway } from '../data-access/platform-dashboard.gateway';
import { PlatformCommercial } from '../domain/platform-commercial.model';
import { PlatformDashboard } from '../domain/platform-dashboard.model';

/** Test-only: scripted gateways and builders for the platform dashboard specs. Imported by specs and nothing else. */

export const SCHOOL = platformId('school');
export const DRIVE = platformId('drive');
export const PLATFORMS: readonly PlatformRef[] = [
  { id: SCHOOL, name: 'Nawara School', key: 'nawara-school', product: 'school' },
  { id: DRIVE, name: 'Nawara Drive', key: 'nawara-drive', product: 'drive' },
];
export const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};
export const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [SCHOOL],
};
export const DEMO: DemoBindings = {
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

export const count = (value: number): Metric => ({ status: 'available', value });

export const dashboardOf = (platform: PlatformId, requests = 12): PlatformDashboard => ({
  platformId: platform,
  periodDays: 30,
  figures: {
    status: 'available',
    data: {
      organizations: count(16),
      organizationsAdded: count(2),
      memberships: count(920),
      membershipRequests: count(requests),
      organizationsWithRequests: count(4),
    },
  },
  recentOrganizations: { status: 'available', data: [] },
  operatorAssignments: { status: 'available', data: count(3) },
  adminInvitationsAwaiting: { status: 'available', data: count(5) },
  activity: { status: 'available', data: [] },
});

export const commercialOf = (platform: PlatformId): PlatformCommercial => ({
  platformId: platform,
  organizationSubscriptions: {
    status: 'available',
    data: [
      { organizationId: organizationId('a'), organizationName: 'A', state: 'active' },
      {
        organizationId: organizationId('b'),
        organizationName: 'B',
        state: 'grace',
        graceEndsAt: '2026-10-24T06:00:00.000Z',
      },
      { organizationId: organizationId('c'), organizationName: 'C', state: 'none' },
    ],
  },
  personalPremium: { status: 'available', data: count(21) },
  paymentIssues: { status: 'available', data: count(1) },
  assistedPayments: {
    status: 'available',
    data: { platform: 'enabled', organizationsDisabled: 1, organizations: 3 },
  },
});

/** What each gateway is asked, and a subject per request so answers arrive when the test says. */
export class ScriptedDashboard extends PlatformDashboardGateway {
  readonly requests: { platform: PlatformId; answer: Subject<PlatformDashboard> }[] = [];
  load(platform: PlatformId): Observable<PlatformDashboard> {
    const answer = new Subject<PlatformDashboard>();
    this.requests.push({ platform, answer });
    return answer;
  }
}

export class ScriptedCommercial extends PlatformCommercialGateway {
  readonly requests: { platform: PlatformId; answer: Subject<PlatformCommercial> }[] = [];
  load(platform: PlatformId): Observable<PlatformCommercial> {
    const answer = new Subject<PlatformCommercial>();
    this.requests.push({ platform, answer });
    return answer;
  }
}

export class ScriptedDirectory extends ScopeDirectoryGateway {
  static answer: () => Observable<readonly PlatformRef[]> = () => of(PLATFORMS);
  calls = 0;
  companyDirectory(): Observable<CompanyDirectory> {
    this.calls += 1;
    return new Observable<CompanyDirectory>((subscriber) =>
      ScriptedDirectory.answer().subscribe({
        next: (platforms) =>
          subscriber.next({ company: { id: companyId('c'), name: 'Company' }, platforms }),
        error: (e: unknown) => subscriber.error(e),
        complete: () => subscriber.complete(),
      }),
    );
  }
  assignedPlatforms(ids: readonly PlatformId[]): Observable<readonly PlatformRef[]> {
    this.calls += 1;
    return of(PLATFORMS.filter((p) => ids.includes(p.id)));
  }
}

@Component({ template: '' })
export class Blank {}
