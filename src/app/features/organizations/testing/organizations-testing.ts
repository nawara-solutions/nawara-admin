import { Component } from '@angular/core';
import { Observable, Subject, of } from 'rxjs';
import { Actor } from '../../../core/auth/actor';
import { DemoBindings } from '../../../core/config/app-environment';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import {
  CompanyDirectory,
  OrganizationId,
  PlatformId,
  PlatformRef,
  companyId,
  organizationId,
  platformId,
} from '../../../core/context/scope.model';
import { Metric } from '../../../shared/dashboard/metric';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import {
  OrganizationCommercial,
  PlatformOrganizationsCommercial,
} from '../domain/organization-commercial.model';
import {
  OrganizationDetail,
  OrganizationDirectory,
  OrganizationSummary,
} from '../domain/organization.model';

/** Test-only: scripted gateways and builders for the Organization specs. Imported by specs and nothing else. */

export const NOW = Date.parse('2026-10-23T12:00:00Z');
export const SCHOOL = platformId('school');
export const DRIVE = platformId('drive');
export const PLATFORMS: readonly PlatformRef[] = [
  { id: SCHOOL, name: 'Nawara School', key: 'nawara-school', product: 'school' },
  { id: DRIVE, name: 'Nawara Drive', key: 'nawara-drive', product: 'drive' },
];
export const RIAD = organizationId('riad');
export const HORIZON = organizationId('horizon');
export const ATLAS = organizationId('atlas');

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
    releases: [],
    companySettings: [],
    accountSecurity: [],
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
    assistance: [],
  },
};

export const count = (value: number): Metric => ({ status: 'available', value });

export const summaryOf = (
  id: OrganizationId,
  name: string,
  createdAt: string,
  memberships: number,
  pending: number,
  platform: PlatformId = SCHOOL,
): OrganizationSummary => ({
  id,
  platformId: platform,
  name,
  createdAt,
  memberships: count(memberships),
  pendingRequests: count(pending),
});

export const directoryOf = (platform: PlatformId = SCHOOL): OrganizationDirectory => ({
  platformId: platform,
  organizations: [
    summaryOf(HORIZON, 'École Horizon', '2026-10-23T10:00:00.000Z', 64, 3, platform),
    summaryOf(RIAD, 'Collège Riad', '2026-09-15T12:00:00.000Z', 87, 5, platform),
    summaryOf(ATLAS, 'Institut Atlas Savoir', '2025-12-27T12:00:00.000Z', 55, 0, platform),
  ],
});

export const detailOf = (
  id: OrganizationId = RIAD,
  platform: PlatformId = SCHOOL,
): OrganizationDetail => ({
  ...summaryOf(id, 'Collège Riad', '2026-09-15T12:00:00.000Z', 87, 5, platform),
  metadata: { taxCode: null, address: null, phone: null, type: null },
  adminInvitationsAwaiting: { status: 'available', data: count(1) },
  activity: {
    status: 'available',
    data: [
      {
        id: 'platform-activity-s2',
        action: 'admin_invitation.created',
        occurredAt: '2026-10-22T10:00:00.000Z',
      },
    ],
  },
});

const DAY = 86_400_000;

export const commercialListOf = (
  platform: PlatformId = SCHOOL,
): PlatformOrganizationsCommercial => ({
  platformId: platform,
  organizations: [
    {
      organizationId: HORIZON,
      subscription: { state: 'active', endsAt: new Date(NOW + 365 * DAY).toISOString() },
      assistedPayments: { effective: 'enabled', platform: 'enabled', organization: 'inherit' },
    },
    {
      organizationId: RIAD,
      subscription: { state: 'active', endsAt: new Date(NOW + 6 * DAY).toISOString() },
      assistedPayments: { effective: 'enabled', platform: 'enabled', organization: 'inherit' },
    },
    {
      organizationId: ATLAS,
      subscription: { state: 'none' },
      assistedPayments: { effective: 'disabled', platform: 'enabled', organization: 'disabled' },
    },
  ],
});

export const commercialOf = (
  id: OrganizationId = RIAD,
  platform: PlatformId = SCHOOL,
): OrganizationCommercial => ({
  organizationId: id,
  platformId: platform,
  subscription: {
    status: 'available',
    data: { state: 'active', endsAt: new Date(NOW + 6 * DAY).toISOString() },
  },
  entitlement: { status: 'available', data: 'entitled' },
  paymentIssues: { status: 'available', data: count(1) },
  assistedPayments: {
    status: 'available',
    data: { effective: 'enabled', platform: 'enabled', organization: 'inherit' },
  },
});

interface Pending<K, T> {
  readonly key: K;
  readonly answer: Subject<T>;
  /** Whether the caller still listens (a cancelled request is unsubscribed). */
  readonly live: () => boolean;
}

function scripted<K, T>(requests: Pending<K, T>[], key: K): Observable<T> {
  const answer = new Subject<T>();
  let subscribed = false;
  requests.push({ key, answer, live: () => subscribed && answer.observed });
  return new Observable<T>((subscriber) => {
    subscribed = true;
    const subscription = answer.subscribe(subscriber);
    return () => subscription.unsubscribe();
  });
}

/** What each gateway is asked, and a subject per request so answers arrive when the test says. */
export class ScriptedOrganizations extends OrganizationGateway {
  readonly lists: Pending<PlatformId, OrganizationDirectory>[] = [];
  readonly loads: Pending<OrganizationId, OrganizationDetail>[] = [];
  list(platform: PlatformId): Observable<OrganizationDirectory> {
    return scripted(this.lists, platform);
  }
  load(organization: OrganizationId): Observable<OrganizationDetail> {
    return scripted(this.loads, organization);
  }
}

export class ScriptedCommercial extends OrganizationCommercialGateway {
  readonly lists: Pending<PlatformId, PlatformOrganizationsCommercial>[] = [];
  readonly loads: Pending<OrganizationId, OrganizationCommercial>[] = [];
  list(platform: PlatformId): Observable<PlatformOrganizationsCommercial> {
    return scripted(this.lists, platform);
  }
  load(organization: OrganizationId): Observable<OrganizationCommercial> {
    return scripted(this.loads, organization);
  }
}

export class ScriptedDirectory extends ScopeDirectoryGateway {
  static answer: () => Observable<readonly PlatformRef[]> = () => of(PLATFORMS);
  companyDirectory(): Observable<CompanyDirectory> {
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
    return of(PLATFORMS.filter((p) => ids.includes(p.id)));
  }
}

@Component({ template: '' })
export class Blank {}
