import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { CompanyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DemoWorldTables } from '../../../demo/world/records';
import {
  companyActivity,
  grantsOf,
  isCompanyPlatform,
  isPlatformActivity,
  organizationsOfCompany,
  platformRefs,
} from '../../../demo/world/selectors';
import { ActivityEntry, AdministrativeActivity } from '../domain/activity.model';
import { ActivityGateway } from './activity.gateway';

/** Which answer the mock gives, so every view state can be exercised. Demo builds use `normal`. */
export type ActivityDemoScenario = 'normal' | 'empty' | 'error';

export const ACTIVITY_DEMO_SCENARIO = new InjectionToken<ActivityDemoScenario>(
  'ACTIVITY_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/**
 * The Company's simulated administrative activity: exactly `companyActivity` (the Company Overview feed's source), in
 * its order, each record's scope read from the record itself. Nothing is generated, and no field the record lacks is
 * added.
 */
export function demoAdministrativeActivity(world: DemoWorldTables): AdministrativeActivity {
  return {
    platforms: platformRefs(world).filter((p) => isCompanyPlatform(world, p.id)),
    organizations: organizationsOfCompany(world).map((o) => ({
      id: o.id,
      platformId: o.platformId,
      name: o.name,
    })),
    entries: companyActivity(world).map((e): ActivityEntry =>
      isPlatformActivity(e)
        ? {
            id: e.id,
            scope: e.organizationId === null ? 'platform' : 'organization',
            action: e.action,
            occurredAt: e.occurredAt,
            platformId: e.platformId,
            organizationId: e.organizationId,
            operatorId: null,
          }
        : {
            id: e.id,
            scope: 'company',
            action: e.action,
            occurredAt: e.occurredAt,
            platformId: null,
            organizationId: null,
            operatorId: e.subjectId,
          },
    ),
  };
}

const NOT_FOUND: AppError = { kind: 'not_found', status: 404 };
/** Core's guard answer for an identity that is not the Company's owner. */
const FORBIDDEN: AppError = { kind: 'forbidden', code: 'forbidden', status: 403 };

/**
 * Mock adapter (demo builds only), reading the demo world at request time. The Company owner only: no session `401`,
 * anyone else `403` (an operator included, whatever their Platform assignments; an Organization admin never reaches
 * it), another Company the collapsed `404`. Read only.
 */
export class MockActivityGateway extends ActivityGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(ACTIVITY_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);

  activity(company: CompanyId): Observable<AdministrativeActivity> {
    return defer(() => {
      const world = this.world.snapshot();
      const signedIn = this.auth.signedIn();
      if (signedIn === null) return this.fail({ kind: 'unauthenticated', status: 401 });
      if (grantsOf(world, signedIn.businessIdentityId).companyId !== world.company.id)
        return this.fail(FORBIDDEN);
      if (company !== world.company.id) return this.fail(NOT_FOUND);
      if (this.scenario === 'error') return this.fail({ kind: 'unavailable', status: 503 });
      const answer = demoAdministrativeActivity(
        this.scenario === 'empty' ? { ...world, activity: [] } : world,
      );
      return of(answer).pipe(delay(this.latency));
    });
  }

  private fail(error: AppError): Observable<never> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_ACTIVITY_PROVIDERS: readonly Provider[] = [
  { provide: ActivityGateway, useClass: MockActivityGateway },
];
