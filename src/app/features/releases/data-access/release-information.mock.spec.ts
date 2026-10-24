import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { companyId } from '../../../core/context/scope.model';
import { AppError, adapterUnavailable } from '../../../core/errors/app-error';
import { AdminIdentityId } from '../../../demo/world/records';
import { DEMO_COMPANY_ID, DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { UnavailableReleaseInformationGateway } from './release-information.gateway';
import {
  DOCUMENTED_RELEASE_INFORMATION,
  MockReleaseInformationGateway,
  RELEASES_DEMO_SCENARIO,
  ReleasesDemoScenario,
} from './release-information.mock';

function setUp(
  as: AdminIdentityId | null = DEMO_OWNER_ID,
  scenario: ReleasesDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: RELEASES_DEMO_SCENARIO, useValue: scenario },
    ],
  });
  if (as !== null)
    TestBed.inject(DemoAuthState).signedIn.set({
      identity: {
        userId: as,
        email: null,
        phone: null,
        adminTier: as === DEMO_OWNER_ID ? 'owner' : 'operator',
      },
      businessIdentityId: as,
    });
  return TestBed.runInInjectionContext(() => new MockReleaseInformationGateway());
}

async function error(source: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(source);
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('Release information (P8-S4)', () => {
  it('states the four documented capabilities and how each stands for Admin', () => {
    expect(DOCUMENTED_RELEASE_INFORMATION.capabilities).toEqual([
      { capability: 'catalog', status: 'notAvailable' },
      { capability: 'publish', status: 'ciOnly' },
      { capability: 'withdraw', status: 'notInAdmin' },
      { capability: 'minimumVersion', status: 'notInAdmin' },
    ]);
  });

  it('holds no release, version, compatibility value, deployment or URL', () => {
    expect(Object.keys(DOCUMENTED_RELEASE_INFORMATION)).toEqual(['capabilities']);
    for (const entry of DOCUMENTED_RELEASE_INFORMATION.capabilities)
      expect(Object.keys(entry).sort()).toEqual(['capability', 'status']);
    expect(JSON.stringify(DOCUMENTED_RELEASE_INFORMATION)).not.toMatch(
      /\d+\.\d+|https?:|deploy|download|compatib/i,
    );
  });

  it('answers the owner, and refuses an operator assigned to every Platform (403) or no session (401)', async () => {
    expect(await firstValueFrom(setUp().information(DEMO_COMPANY_ID))).toEqual(
      DOCUMENTED_RELEASE_INFORMATION,
    );
    TestBed.resetTestingModule();
    expect(await error(setUp(DEMO_OPERATOR_IDS.multi).information(DEMO_COMPANY_ID))).toEqual({
      kind: 'forbidden',
      code: 'forbidden',
      status: 403,
    });
    TestBed.resetTestingModule();
    expect(await error(setUp(null).information(DEMO_COMPANY_ID))).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
  });

  it('collapses another Company to 404 and simulates an unavailable answer', async () => {
    expect(
      await error(setUp().information(companyId('0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1aff'))),
    ).toEqual({ kind: 'not_found', status: 404 });
    TestBed.resetTestingModule();
    expect(await error(setUp(DEMO_OWNER_ID, 'error').information(DEMO_COMPANY_ID))).toMatchObject({
      kind: 'unavailable',
      status: 503,
    });
  });

  it('offers one read and no command, and is unavailable in every other build', async () => {
    expect(
      Object.getOwnPropertyNames(MockReleaseInformationGateway.prototype)
        .filter((m) => m !== 'constructor')
        .sort(),
    ).toEqual(['fail', 'information']);
    await expect(
      firstValueFrom(new UnavailableReleaseInformationGateway().information()),
    ).rejects.toEqual(adapterUnavailable());
  });
});
