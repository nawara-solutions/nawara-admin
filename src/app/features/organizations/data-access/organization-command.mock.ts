import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { CommandOptions, IDEMPOTENCY_KEY_FORMAT } from '../../../core/actions/command-options';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { AppError } from '../../../core/errors/app-error';
import {
  CREATE_ORGANIZATION_COMMAND,
  createOrganization,
  normaliseOrganizationPatch,
  normaliseOrganizationRequest,
  organizationAuthority,
  updateOrganization,
} from '../../../demo/world/commands/organization.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  CreateOrganizationRequest,
  CreatedOrganization,
} from '../domain/create-organization.model';
import { OrganizationPatch, UpdatedOrganization } from '../domain/edit-organization.model';
import { OrganizationCommandGateway } from './organization-command.gateway';
import { OrganizationId } from '../../../core/context/scope.model';
import { OrganizationRecord } from '../../../demo/world/records';

/**
 * Which answer the mock gives (§3). Demo builds use `normal`, which SUCCEEDS. The others:
 * - `notAuthoritative`: Core's documented `409 not_authoritative` before the organization-service cutover (the step-up
 *   is spent first, as in Core);
 * - `outcomeUnknown`: the command is applied but the first answer is lost. A create retried with the same key replays
 *   it; an edit has no key, so its first answer per Organization is lost and nothing replays it (the caller reloads);
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
  /** `outcomeUnknown`: the keys (create) and Organizations (edit) whose first answer was already lost. */
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
    if (organizationAuthority(world, actor, request.platformId) === null)
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
    return of<CreatedOrganization>({
      organization: dtoOf(outcome.result.organization),
      replayed: outcome.result.replayed,
    }).pipe(delay(this.latency));
  }

  /**
   * The simulated PATCH, in the verified order: session (`401`), the body (`400`: empty, unknown or immutable fields, a
   * cleared or blank name, an empty string, a value over its limit), the Organization (`404 not_found`), authority
   * (`403 admin_forbidden`: the owner of its Company or an operator assigned to its Platform), the write gate, then one
   * commit. A patch equal to the current values writes nothing and still answers `200` with the representation.
   */
  update(organization: OrganizationId, patch: OrganizationPatch): Observable<UpdatedOrganization> {
    return defer(() => this.applyUpdate(organization, patch));
  }

  private applyUpdate(
    organizationId: OrganizationId,
    raw: OrganizationPatch,
  ): Observable<UpdatedOrganization> {
    const fail = (error: AppError) =>
      timer(this.latency).pipe(switchMap(() => throwError(() => error)));
    const signedIn = this.auth.signedIn();
    if (signedIn === null || signedIn.businessIdentityId === null)
      return fail({ kind: 'unauthenticated', status: 401 });
    const patch = normaliseOrganizationPatch(raw);
    if ('kind' in patch) return fail(patch);
    const actor = signedIn.businessIdentityId;
    const world = this.world.snapshot();
    const current = world.organizations.find((o) => o.id === organizationId);
    if (current === undefined) return fail({ kind: 'not_found', code: 'not_found', status: 404 });
    if (organizationAuthority(world, actor, current.platformId) === null)
      return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 });
    if (this.scenario === 'unavailable') return fail({ kind: 'unavailable', status: 503 });
    if (this.scenario === 'notAuthoritative')
      return fail({ kind: 'conflict', code: 'not_authoritative', status: 409 });
    const outcome = this.world.commit((tables) =>
      updateOrganization(tables, { organizationId, patch, actor, now: this.now() }),
    );
    if (!outcome.ok) return fail(outcome.error);
    if (this.scenario === 'outcomeUnknown' && !this.lost.has(`update:${organizationId}`)) {
      this.lost.add(`update:${organizationId}`);
      return fail({ kind: 'network', status: 0 });
    }
    return of(dtoOf(outcome.result.organization)).pipe(delay(this.latency));
  }
}

/** Core's `OrganizationDto` of a record. */
const dtoOf = (o: OrganizationRecord): UpdatedOrganization => ({
  id: o.id,
  platformId: o.platformId,
  name: o.name,
  taxCode: o.taxCode,
  address: o.address,
  phone: o.phone,
  type: o.type,
  createdAt: o.createdAt,
  updatedAt: o.updatedAt,
});

export const MOCK_ORGANIZATION_COMMAND_PROVIDERS: readonly Provider[] = [
  { provide: OrganizationCommandGateway, useClass: MockOrganizationCommandGateway },
];
