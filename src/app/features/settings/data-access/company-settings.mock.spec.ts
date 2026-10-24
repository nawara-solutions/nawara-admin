import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { companyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import { companyDirectoryOf } from '../../../demo/world/selectors';
import { DEMO_COMPANY_ID, DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import {
  COMPANY_SETTINGS_DEMO_SCENARIO,
  CompanySettingsDemoScenario,
  MockCompanySettingsGateway,
} from './company-settings.mock';

function setUp(
  as: AdminIdentityId | null = DEMO_OWNER_ID,
  scenario: CompanySettingsDemoScenario = 'normal',
) {
  TestBed.configureTestingModule({
    providers: [
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: COMPANY_SETTINGS_DEMO_SCENARIO, useValue: scenario },
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
  return TestBed.runInInjectionContext(() => new MockCompanySettingsGateway());
}

async function error(source: Observable<unknown>): Promise<AppError> {
  try {
    await firstValueFrom(source);
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected an error');
}

describe('Company settings mock (P9-S3)', () => {
  it('answers the owner with the demo world’s Company, through the scope directory’s selector', async () => {
    const settings = await firstValueFrom(setUp().load(DEMO_COMPANY_ID));
    const directory = companyDirectoryOf(TestBed.inject(DemoWorld).snapshot());
    expect(settings).toEqual({
      company: directory.company,
      platformCount: directory.platforms.length,
    });
    expect(settings.company.name).toBe('Nawara Solutions');
  });

  it('holds only the name, the id and the Platform count: no contact, address, legal identity, billing or branding', async () => {
    const settings = await firstValueFrom(setUp().load(DEMO_COMPANY_ID));
    expect(Object.keys(settings).sort()).toEqual(['company', 'platformCount']);
    expect(Object.keys(settings.company).sort()).toEqual(['id', 'name']);
  });

  it('refuses every operator, whatever their Platform assignments (403)', async () => {
    for (const id of Object.values(DEMO_OPERATOR_IDS)) {
      TestBed.resetTestingModule();
      expect(await error(setUp(id).load(DEMO_COMPANY_ID))).toMatchObject({
        kind: 'forbidden',
        status: 403,
      });
    }
  });

  it('refuses without a session (401), and another Company as Core’s collapsed 404', async () => {
    expect(await error(setUp(null).load(DEMO_COMPANY_ID))).toMatchObject({
      kind: 'unauthenticated',
      status: 401,
    });
    TestBed.resetTestingModule();
    expect(await error(setUp().load(companyId('another-company')))).toMatchObject({
      kind: 'not_found',
      status: 404,
    });
  });

  it('can be unavailable (the error scenario)', async () => {
    expect(await error(setUp(DEMO_OWNER_ID, 'error').load(DEMO_COMPANY_ID))).toMatchObject({
      kind: 'unavailable',
      status: 503,
    });
  });
});
