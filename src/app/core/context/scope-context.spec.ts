import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { Actor } from '../auth/actor';
import { AuthSession } from '../auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../config/app-environment';
import { DEMO_COMPANY_ID, DEMO_DRIVE_PLATFORM_ID } from './scope-directory.fixtures';
import { ScopeDirectoryGateway } from './scope-directory.gateway';
import { DEMO_LATENCY_MS, MockScopeDirectoryGateway } from './scope-directory.mock';
import { ScopeContext, platformPath, scopeFromUrl } from './scope-context';
import { platformId } from './scope.model';

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
