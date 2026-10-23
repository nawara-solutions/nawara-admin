import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { CommandOptions, IDEMPOTENCY_KEY_FORMAT } from '../../../core/actions/command-options';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import {
  CREATE_ORGANIZATION_COMMAND,
  createOrganization,
  normaliseOrganizationRequest,
  organizationCreateAuthority,
} from '../../../demo/world/commands/organization.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  CreateOrganizationRequest,
  CreatedOrganization,
} from '../domain/create-organization.model';
import { OrganizationCommandGateway } from './organization-command.gateway';

/**
 * Which answer the mock gives (§3). Demo builds use `normal`, which SUCCEEDS. The others:
 * - `notAuthoritative`: Core's documented `409 not_authoritative` before the organization-service cutover (the step-up
 *   is spent first, as in Core);
 * - `outcomeUnknown`: the Organization is created but the first answer is lost; a retry with the same key replays it;
 * - `unavailable`: the service refuses before applying anything (`503`).
 */
export type OrganizationCommandsDemoScenario =
  'normal' | 'notAuthoritative' | 'outcomeUnknown' | 'unavailable';

export const ORGANIZATION_COMMANDS_DEMO_SCENARIO =
  new InjectionToken<OrganizationCommandsDemoScenario>('ORGANIZATION_COMMANDS_DEMO_SCENARIO', {
    factory: () => 'normal',
  });

/**
 * Mock adapter (demo builds only): the simulated organization-service, in Core's verified order (`admin.controller.ts`
 * `createOrganization`): the idempotency key, the request, the parent Platform (an unknown one is `404 not_found`),
 * authority (`403 admin_forbidden`), the step-up for `organization.create` (`403 step_up_required`), then the write gate
 * and the replay record inside one commit. An operator is authorized by Core in principle, but can never present a
 * step-up (Core has none for operators), so every operator attempt ends at `step_up_required`.
 */
export class MockOrganizationCommandGateway extends OrganizationCommandGateway {
  readonly available = true;
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(ORGANIZATION_COMMANDS_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);
  /** `outcomeUnknown`: the keys whose first answer was already lost. */
  private readonly lost = new Set<string>();

  /** Applied when subscribed (once per subscription), as a request is sent when the caller subscribes. */
  create(
    request: CreateOrganizationRequest,
    options: CommandOptions,
  ): Observable<CreatedOrganization> {
    return defer(() => this.apply(request, options));
  }

  private apply(
    raw: CreateOrganizationRequest,
    options: CommandOptions,
  ): Observable<CreatedOrganization> {
    const fail = (error: AppError) =>
      timer(this.latency).pipe(switchMap(() => throwError(() => error)));
    const signedIn = this.auth.signedIn();
    if (signedIn === null || signedIn.businessIdentityId === null)
      return fail({ kind: 'unauthenticated', status: 401 });
    if (!IDEMPOTENCY_KEY_FORMAT.test(options.idempotencyKey))
      return fail({ kind: 'validation', messages: ['Idempotency-Key is required'], status: 400 });
    const request = normaliseOrganizationRequest(raw);
    if ('kind' in request) return fail(request);
    const actor = signedIn.businessIdentityId;
    const world = this.world.snapshot();
    if (!world.platforms.some((p) => p.id === request.platformId))
      return fail({ kind: 'not_found', code: 'not_found', status: 404 });
    if (organizationCreateAuthority(world, actor, request.platformId) === null)
      return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 });
    const now = this.now();
    if (
      !this.auth.consumeStepUp(
        options.stepUpToken,
        CREATE_ORGANIZATION_COMMAND,
        signedIn.identity.userId,
        now,
      )
    )
      return fail({ kind: 'forbidden', code: 'step_up_required', status: 403 });
    if (this.scenario === 'unavailable') return fail({ kind: 'unavailable', status: 503 });
    if (this.scenario === 'notAuthoritative')
      return fail({ kind: 'conflict', code: 'not_authoritative', status: 409 });
    const outcome = this.world.commit((tables) =>
      createOrganization(tables, { request, idempotencyKey: options.idempotencyKey, actor, now }),
    );
    if (!outcome.ok) return fail(outcome.error);
    if (this.scenario === 'outcomeUnknown' && !this.lost.has(options.idempotencyKey)) {
      this.lost.add(options.idempotencyKey);
      return fail({ kind: 'network', status: 0 });
    }
    const o = outcome.result.organization;
    return of<CreatedOrganization>({
      organization: {
        id: o.id,
        platformId: o.platformId,
        name: o.name,
        taxCode: o.taxCode,
        address: o.address,
        phone: o.phone,
        type: o.type,
        createdAt: o.createdAt,
        updatedAt: o.createdAt,
      },
      replayed: outcome.result.replayed,
    }).pipe(delay(this.latency));
  }
}

export const MOCK_ORGANIZATION_COMMAND_PROVIDERS: readonly Provider[] = [
  { provide: OrganizationCommandGateway, useClass: MockOrganizationCommandGateway },
];
