import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { DEMO_LATENCY_MS } from '../../../core/context/scope-directory.mock';
import { OrganizationId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import {
  createAdminInvitation,
  mayManageInvitations,
  normaliseInvitationCreate,
  revokeAdminInvitation,
} from '../../../demo/world/commands/admin-invitation.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import { invitationStatusOf } from '../../../demo/world/selectors';
import { NW_CLOCK } from '../../../shared/format/clock';
import {
  AdminInvitationList,
  CreateAdminInvitationRequest,
  CreatedAdminInvitation,
} from '../domain/admin-invitation.model';
import { AdminInvitationGateway, InvitationCommandOptions } from './admin-invitation.gateway';

/**
 * Which answer the mock gives (§3). Demo builds use `normal`, which SUCCEEDS. The others:
 * - `outcomeUnknown`: the command is applied but its first answer is lost (nothing replays it: no idempotency);
 * - `collision`: Core's rare `409 conflict` on a code collision (nothing created, the step-up not spent);
 * - `rateLimited`: the shared per-actor bucket is exhausted (`429 rate_limited`, no Retry-After);
 * - `unavailable`: the service refuses before applying anything (`503`).
 */
export type AdminInvitationsDemoScenario =
  'normal' | 'outcomeUnknown' | 'collision' | 'rateLimited' | 'unavailable';

export const ADMIN_INVITATIONS_DEMO_SCENARIO = new InjectionToken<AdminInvitationsDemoScenario>(
  'ADMIN_INVITATIONS_DEMO_SCENARIO',
  { factory: () => 'normal' },
);

/** Core's `invitation_manage_actor` bucket (default 20 per hour per actor), shared by create and revoke. */
export const INVITATION_MANAGE_LIMIT = { limit: 20, windowMs: 3_600_000 } as const;

/** Crockford base 32 (no I, L, O, U), as Core's `crypto/join-code.ts`. 256 / 32 is exact, so `& 31` is unbiased. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A Core-format invitation code (`generateInvitationCode`): 12 characters (60 bits) from the CSPRNG, shown
 * `XXXX-XXXX-XXXX`. The demo marks it only through the dialog's "simulated" badge, never in the code itself.
 */
export function generateDemoInvitationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const chars = Array.from(bytes, (b) => CROCKFORD[b & 31]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/**
 * Mock adapter (demo builds only): the simulated auth-service, in its verified order.
 * - Create: the body (`400`), throttle (`429`, every attempt counts), the Organization and authority (`404`), the
 *   step-up for `admin_invitation.create` (`403 step_up_required`), then the insert. The step-up is spent only when the
 *   invitation is committed: a refusal after it (a collision) rolls it back, as Core's transaction does.
 * - Revoke: throttle, authority, step-up `admin_invitation.revoke`, then the conditional update; nothing to revoke is
 *   `404` and does not spend the step-up.
 * - List: authority, then metadata and the derived status, newest first; never a code or a contact.
 * The code is generated here and returned in the one create answer: it is never stored anywhere.
 */
export class MockAdminInvitationGateway extends AdminInvitationGateway {
  readonly available = true;
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(ADMIN_INVITATIONS_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);
  /** Per user id: the instants of create/revoke attempts in the current window (Core's shared bucket). */
  private readonly hits = new Map<string, number[]>();

  list(organization: OrganizationId): Observable<AdminInvitationList> {
    return defer((): Observable<AdminInvitationList> => {
      const session = this.session();
      if ('kind' in session) return this.fail(session);
      const world = this.world.snapshot();
      if (!mayManageInvitations(world, session.actor, organization))
        return this.fail({ kind: 'not_found', code: 'not_found', status: 404 });
      const now = this.now();
      const invitations = world.adminInvitations
        .filter((i) => i.organizationId === organization)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((i) => ({
          id: i.id,
          invitationType: i.invitationType,
          contactBound: i.contactBound,
          expiresAt: i.expiresAt,
          createdAt: i.createdAt,
          createdBy: i.createdBy,
          consumedAt: i.consumedAt,
          revokedAt: i.revokedAt,
          status: invitationStatusOf(i, now),
        }));
      return of<AdminInvitationList>({ organizationId: organization, invitations }).pipe(
        delay(this.latency),
      );
    });
  }

  create(
    organization: OrganizationId,
    raw: CreateAdminInvitationRequest,
    options: InvitationCommandOptions,
  ): Observable<CreatedAdminInvitation> {
    return defer((): Observable<CreatedAdminInvitation> => {
      const session = this.session();
      if ('kind' in session) return this.fail(session);
      if (this.scenario === 'unavailable') return this.fail({ kind: 'unavailable', status: 503 });
      const request = normaliseInvitationCreate(raw);
      if ('kind' in request) return this.fail(request);
      const throttled = this.throttle(session.userId);
      if (throttled) return this.fail(throttled);
      const now = this.now();
      if (!mayManageInvitations(this.world.snapshot(), session.actor, organization))
        return this.fail({ kind: 'not_found', code: 'not_found', status: 404 });
      if (
        !this.auth.checkStepUp(options.stepUpToken, 'admin_invitation.create', session.userId, now)
      )
        return this.fail({ kind: 'forbidden', code: 'step_up_required', status: 403 });
      if (this.scenario === 'collision')
        return this.fail({ kind: 'conflict', code: 'conflict', status: 409 });
      const outcome = this.world.commit((tables) =>
        createAdminInvitation(tables, {
          organizationId: organization,
          request,
          actor: session.actor,
          createdBy: session.userId,
          now,
        }),
      );
      if (!outcome.ok) return this.fail(outcome.error);
      // Committed: the step-up is spent.
      this.auth.consumeStepUp(options.stepUpToken, 'admin_invitation.create', session.userId, now);
      if (this.scenario === 'outcomeUnknown') return this.fail({ kind: 'network', status: 0 });
      const i = outcome.result;
      return of<CreatedAdminInvitation>({
        id: i.id,
        invitationType: i.invitationType,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
        contactBound: i.contactBound,
        code: generateDemoInvitationCode(),
      }).pipe(delay(this.latency));
    });
  }

  revoke(
    organization: OrganizationId,
    invitationId: string,
    options: InvitationCommandOptions,
  ): Observable<void> {
    return defer((): Observable<void> => {
      const session = this.session();
      if ('kind' in session) return this.fail(session);
      if (this.scenario === 'unavailable') return this.fail({ kind: 'unavailable', status: 503 });
      const throttled = this.throttle(session.userId);
      if (throttled) return this.fail(throttled);
      const now = this.now();
      if (!mayManageInvitations(this.world.snapshot(), session.actor, organization))
        return this.fail({ kind: 'not_found', code: 'not_found', status: 404 });
      if (
        !this.auth.checkStepUp(options.stepUpToken, 'admin_invitation.revoke', session.userId, now)
      )
        return this.fail({ kind: 'forbidden', code: 'step_up_required', status: 403 });
      const outcome = this.world.commit((tables) =>
        revokeAdminInvitation(tables, {
          organizationId: organization,
          invitationId,
          actor: session.actor,
          revokedBy: session.userId,
          now,
        }),
      );
      // Nothing to revoke: Core rolls back, so the step-up stays unspent.
      if (!outcome.ok) return this.fail(outcome.error);
      this.auth.consumeStepUp(options.stepUpToken, 'admin_invitation.revoke', session.userId, now);
      if (this.scenario === 'outcomeUnknown') return this.fail({ kind: 'network', status: 0 });
      return of(undefined).pipe(delay(this.latency));
    });
  }

  private session(): { readonly userId: string; readonly actor: AdminIdentityId } | AppError {
    const signedIn = this.auth.signedIn();
    if (signedIn === null) return { kind: 'unauthenticated', status: 401 };
    // An account without a business identity (not an Admin actor) has no relation to any Organization: one 404.
    if (signedIn.businessIdentityId === null)
      return { kind: 'not_found', code: 'not_found', status: 404 };
    return { userId: signedIn.identity.userId, actor: signedIn.businessIdentityId };
  }

  /** Core's shared bucket: every create or revoke attempt counts, failed or not. */
  private throttle(userId: string): AppError | null {
    if (this.scenario === 'rateLimited') return { kind: 'rate_limited', status: 429 };
    const now = this.now();
    const recent = (this.hits.get(userId) ?? []).filter(
      (t) => t > now - INVITATION_MANAGE_LIMIT.windowMs,
    );
    recent.push(now);
    this.hits.set(userId, recent);
    return recent.length > INVITATION_MANAGE_LIMIT.limit
      ? { kind: 'rate_limited', status: 429 }
      : null;
  }

  private fail<T>(error: AppError): Observable<T> {
    return timer(this.latency).pipe(switchMap(() => throwError(() => error)));
  }
}

export const MOCK_ADMIN_INVITATION_PROVIDERS: readonly Provider[] = [
  { provide: AdminInvitationGateway, useClass: MockAdminInvitationGateway },
];
