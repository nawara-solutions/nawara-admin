import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { companyDirectoryOf, grantsOf } from '../../../demo/world/selectors';
import { CompanySettings, CompanySettingsGateway } from './company-settings.gateway';

/** Which answer the mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type CompanySettingsDemoScenario = 'normal' | 'error';

export const COMPANY_SETTINGS_DEMO_SCENARIO = new InjectionToken<CompanySettingsDemoScenario>(
  'COMPANY_SETTINGS_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/**
 * Mock adapter (demo builds only): the demo world's Company, through the scope directory's selector (no record of its
 * own), for the Company owner only: no session `401`; anyone else `403`, an operator included whatever their Platform
 * assignments; another Company the collapsed `404`. No request, no command.
 */
export class MockCompanySettingsGateway extends CompanySettingsGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(COMPANY_SETTINGS_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  load(company: CompanyId): Observable<CompanySettings> {
    return defer(() => {
      const world = this.world.snapshot();
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (grantsOf(world, signedIn.businessIdentityId).companyId !== world.company.id)
        return this.fail({ kind: 'forbidden', code: 'forbidden', status: 403 });
      if (company !== world.company.id) return this.fail({ kind: 'not_found', status: 404 });
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const directory = companyDirectoryOf(world);
      return of<CompanySettings>({
        company: directory.company,
        platformCount: directory.platforms.length,
      }).pipe(delay(this.latency));
    });
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_COMPANY_SETTINGS_PROVIDERS: readonly Provider[] = [
  { provide: CompanySettingsGateway, useClass: MockCompanySettingsGateway },
];
