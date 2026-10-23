import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import {
  CREATE_PLATFORM_COMMAND,
  createPlatform,
} from '../../../demo/world/commands/platform.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { NW_CLOCK } from '../../../shared/format/clock';
import { CreatePlatformRequest, CreatedPlatform } from '../domain/create-platform.model';
import { CommandOptions, PlatformCommandGateway } from './platform-command.gateway';

/**
 * Which answer the mock gives (§3). Demo builds use `normal`, which SUCCEEDS (owner decision O-P4-2). The others:
 * - `notAuthoritative`: Core's documented `409 not_authoritative` (writes refused until the organization-service cutover);
 * - `outcomeUnknown`: the Platform is created, but the first answer is lost (a network failure), so a retry with the same
 *   key must replay it, never create a second one;
 * - `unavailable`: the service refuses before applying anything (`503`).
 */
export type PlatformCommandsDemoScenario =
  'normal' | 'notAuthoritative' | 'outcomeUnknown' | 'unavailable';

export const PLATFORM_COMMANDS_DEMO_SCENARIO = new InjectionToken<PlatformCommandsDemoScenario>(
  'PLATFORM_COMMANDS_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/**
 * Mock adapter of Platform commands (demo builds only). The simulated Core: it consumes the simulated step-up grant
 * (single use, bound to the owner and to `platform.create`), then applies the domain command through the demo world's
 * one commit boundary, so the new Platform appears in every view at once. Nothing reaches a real service.
 */
export class MockPlatformCommandGateway extends PlatformCommandGateway {
  readonly available = true;
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(PLATFORM_COMMANDS_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);
  /** `outcomeUnknown`: the keys whose first answer was already lost. */
  private readonly lost = new Set<string>();

  /** Applied when subscribed (once per subscription), as a request is sent when the caller subscribes. */
  create(request: CreatePlatformRequest, options: CommandOptions): Observable<CreatedPlatform> {
    return defer(() => this.apply(request, options));
  }

  private apply(
    request: CreatePlatformRequest,
    options: CommandOptions,
  ): Observable<CreatedPlatform> {
    const fail = (error: AppError) =>
      timer(this.latency).pipe(switchMap(() => throwError(() => error)));
    const signedIn = this.auth.signedIn();
    if (signedIn === null || signedIn.businessIdentityId === null)
      return fail({ kind: 'unauthenticated', status: 401 });
    const now = this.now();
    if (
      !this.auth.consumeStepUp(
        options.stepUpToken,
        CREATE_PLATFORM_COMMAND,
        signedIn.identity.userId,
        now,
      )
    )
      return fail({ kind: 'forbidden', code: 'step_up_required', status: 403 });
    if (this.scenario === 'unavailable') return fail({ kind: 'unavailable', status: 503 });
    if (this.scenario === 'notAuthoritative')
      return fail({ kind: 'conflict', code: 'not_authoritative', status: 409 });
    const actor = signedIn.businessIdentityId;
    const outcome = this.world.commit((world) =>
      createPlatform(world, {
        companyId: request.companyId,
        name: request.name,
        idempotencyKey: options.idempotencyKey,
        actor,
        now,
      }),
    );
    if (!outcome.ok) return fail(outcome.error);
    if (this.scenario === 'outcomeUnknown' && !this.lost.has(options.idempotencyKey)) {
      this.lost.add(options.idempotencyKey);
      return fail({ kind: 'network', status: 0 });
    }
    const { id, name, key, product } = outcome.result.platform;
    return of({ platform: { id, name, key, product }, replayed: outcome.result.replayed }).pipe(
      delay(this.latency),
    );
  }
}

export const MOCK_PLATFORM_COMMAND_PROVIDERS: readonly Provider[] = [
  { provide: PlatformCommandGateway, useClass: MockPlatformCommandGateway },
];
