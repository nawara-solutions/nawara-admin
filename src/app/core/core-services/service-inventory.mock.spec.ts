import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { companyId } from '../context/scope.model';
import { AppError, adapterUnavailable } from '../errors/app-error';
import { AdminIdentityId } from '../../demo/world/records';
import { DEMO_COMPANY_ID, DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../demo/world/seed';
import { CORE_SERVICES } from './core-service.model';
import { UnavailableServiceInventoryGateway } from './service-inventory.gateway';
import {
  DOCUMENTED_SERVICE_INVENTORY,
  MockServiceInventoryGateway,
  SERVICES_DEMO_SCENARIO,
  ServicesDemoScenario,
} from './service-inventory.mock';

function setUp(
  as: AdminIdentityId | null = DEMO_OWNER_ID,
  scenario: ServicesDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: SERVICES_DEMO_SCENARIO, useValue: scenario },
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
  return TestBed.runInInjectionContext(() => new MockServiceInventoryGateway());
}

async function error(source: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(source);
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('Service inventory (P8-S2)', () => {
  it('is the eight documented Core services, in the documented order', () => {
    expect([...CORE_SERVICES]).toEqual([
      'auth',
      'organization',
      'release',
      'billing',
      'payment',
      'file',
      'notification',
      'audit',
    ]);
    expect(DOCUMENTED_SERVICE_INVENTORY.services).toEqual(CORE_SERVICES);
  });

  it('carries no status, uptime, latency, version or endpoint: live health is unavailable', () => {
    expect(Object.keys(DOCUMENTED_SERVICE_INVENTORY).sort()).toEqual(['liveHealth', 'services']);
    expect(DOCUMENTED_SERVICE_INVENTORY.liveHealth).toBe('unavailable');
    for (const service of DOCUMENTED_SERVICE_INVENTORY.services)
      expect(typeof service).toBe('string');
    expect(JSON.stringify(DOCUMENTED_SERVICE_INVENTORY)).not.toMatch(
      /operational|delayed|degraded|healthy|uptime|latency|version|https?:|\/health|\/ready/i,
    );
  });

  it('answers the owner with the documented inventory', async () => {
    expect(await firstValueFrom(setUp().inventory(DEMO_COMPANY_ID))).toEqual(
      DOCUMENTED_SERVICE_INVENTORY,
    );
  });

  it('refuses an operator, even one assigned to every Platform (403), and a caller without a session (401)', async () => {
    expect(await error(setUp(DEMO_OPERATOR_IDS.multi).inventory(DEMO_COMPANY_ID))).toEqual({
      kind: 'forbidden',
      code: 'forbidden',
      status: 403,
    });
    TestBed.resetTestingModule();
    expect(await error(setUp(null).inventory(DEMO_COMPANY_ID))).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
  });

  it('collapses another Company to 404 and simulates an unavailable answer', async () => {
    expect(
      await error(setUp().inventory(companyId('0c2f4e3a-5d1b-4b8e-9a51-7f0d2c9e1aff'))),
    ).toEqual({ kind: 'not_found', status: 404 });
    TestBed.resetTestingModule();
    expect(await error(setUp(DEMO_OWNER_ID, 'error').inventory(DEMO_COMPANY_ID))).toMatchObject({
      kind: 'unavailable',
      status: 503,
    });
  });

  it('offers one read only, and is unavailable in every other build', async () => {
    expect(
      Object.getOwnPropertyNames(MockServiceInventoryGateway.prototype)
        .filter((m) => m !== 'constructor')
        .sort(),
    ).toEqual(['fail', 'inventory']);
    await expect(
      firstValueFrom(new UnavailableServiceInventoryGateway().inventory()),
    ).rejects.toEqual(adapterUnavailable());
  });
});
