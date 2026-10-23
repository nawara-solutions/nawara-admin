import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { Actor } from '../auth/actor';
import { AuthSession } from '../auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../config/app-environment';
import { DEMO_COMPANY_ID, DEMO_DRIVE_PLATFORM_ID } from '../../demo/world/seed';
import { ScopeDirectoryGateway } from './scope-directory.gateway';
import { DEMO_LATENCY_MS, MockScopeDirectoryGateway } from './scope-directory.mock';
import {
  ScopeContext,
  membersPath,
  membershipPath,
  organizationOfPage,
  organizationPath,
  organizationsPath,
  platformPageFromUrl,
  platformPath,
  scopeFromUrl,
} from './scope-context';
import { organizationId, platformId } from './scope.model';

describe('scope from the URL (the URL is the source of truth, docs/ARCHITECTURE.md §7)', () => {
  it('treats company pages as company scope ("All platforms")', () => {
    expect(scopeFromUrl('/overview')).toEqual({ kind: 'company' });
    expect(scopeFromUrl('/')).toEqual({ kind: 'company' });
    expect(scopeFromUrl('/forbidden?x=1')).toEqual({ kind: 'company' });
  });

  it('reads the platform scope from /platforms/:platformId, ignoring query and fragment', () => {
    expect(scopeFromUrl('/platforms/abc-123')).toEqual({
      kind: 'platform',
      platformId: 'abc-123',
    });
    expect(scopeFromUrl('/platforms/abc-123/organizations?cursor=x#top')).toEqual({
      kind: 'platform',
      platformId: 'abc-123',
    });
  });

  it('does not invent a platform scope from /platforms alone', () => {
    expect(scopeFromUrl('/platforms')).toEqual({ kind: 'company' });
  });

  it('builds platform URLs that round-trip', () => {
    const id = platformId('5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01');
    expect(scopeFromUrl(platformPath(id))).toEqual({ kind: 'platform', platformId: id });
  });
});

describe('the platform page from the URL (Organizations are entities of platform scope)', () => {
  it('tells the dashboard, the Organization directory and one Organization apart', () => {
    expect(platformPageFromUrl('/platforms/p')).toEqual({ kind: 'dashboard' });
    expect(platformPageFromUrl('/platforms/p/organizations?q=riad&sort=name')).toEqual({
      kind: 'organizations',
    });
    expect(platformPageFromUrl('/platforms/p/organizations/o%2F1#top')).toEqual({
      kind: 'organization',
      organizationId: 'o/1',
    });
  });

  it('recognises nothing else, and never makes an Organization a scope of its own', () => {
    expect(platformPageFromUrl('/overview')).toEqual({ kind: 'other' });
    expect(platformPageFromUrl('/platforms/p/settings')).toEqual({ kind: 'other' });
    expect(platformPageFromUrl('/platforms/p/organizations/o/settings')).toEqual({ kind: 'other' });
    expect(platformPageFromUrl('/platforms/p/organizations/o/members/m/x')).toEqual({
      kind: 'other',
    });
    for (const url of ['/platforms/p/organizations/o', '/platforms/p/organizations/o/members/m'])
      expect(scopeFromUrl(url)).toEqual({ kind: 'platform', platformId: 'p' });
  });

  it('tells an Organization’s members and one membership apart (P5-S1), still in platform scope', () => {
    expect(platformPageFromUrl('/platforms/p/organizations/o/members?status=pending')).toEqual({
      kind: 'members',
      organizationId: 'o',
    });
    expect(platformPageFromUrl('/platforms/p/organizations/o/members/m%201')).toEqual({
      kind: 'membership',
      organizationId: 'o',
      membershipId: 'm 1',
    });
    expect(membershipPath(platformId('p'), organizationId('o'), 'm 1')).toBe(
      '/platforms/p/organizations/o/members/m%201',
    );
    expect(
      organizationOfPage(platformPageFromUrl(membersPath(platformId('p'), organizationId('o')))),
    ).toBe('o');
    expect(organizationOfPage({ kind: 'dashboard' })).toBeNull();
  });

  it('builds Organization URLs that round-trip', () => {
    const platform = platformId('5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01');
    const organization = organizationId('3f6d2b10-8c4e-4a71-9b2c-5e0f1a2b3c03');
    expect(platformPageFromUrl(organizationsPath(platform))).toEqual({ kind: 'organizations' });
    expect(platformPageFromUrl(organizationPath(platform, organization))).toEqual({
      kind: 'organization',
      organizationId: organization,
    });
  });
});

describe('ScopeContext: the Platforms the actor may see', () => {
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
      stepUp: [],
    },
  };

  async function platformsFor(actor: Actor) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: APP_ENVIRONMENT,
          useValue: { production: false, demo: { load: async () => DEMO } },
        },
        { provide: DEMO_LATENCY_MS, useValue: 0 },
        { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
        ScopeContext,
      ],
    });
    TestBed.inject(AuthSession).establish(actor);
    const context = TestBed.inject(ScopeContext);
    return firstValueFrom(
      context.platforms$.pipe(filter((s) => s.status !== 'idle' && s.status !== 'loading')),
    );
  }

  it('gives an owner the Company’s Platforms', async () => {
    const state = await platformsFor({
      kind: 'owner',
      userId: 'o',
      email: 'owner@x.invalid',
      companyId: DEMO_COMPANY_ID,
    });
    expect(state.status === 'success' && state.data.map((p) => p.name)).toEqual([
      'Nawara School',
      'Nawara Drive',
    ]);
  });

  it('gives an operator only their assigned Platforms, named, without a Company directory', async () => {
    const state = await platformsFor({
      kind: 'operator',
      userId: 'p',
      email: null,
      phone: '+99900000001',
      platformAssignments: [DEMO_DRIVE_PLATFORM_ID],
    });
    expect(state.status === 'success' && state.data.map((p) => p.name)).toEqual(['Nawara Drive']);
  });
});
