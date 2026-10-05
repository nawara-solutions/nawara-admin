import { CompanyId, PlatformId } from '../context/scope.model';

/**
 * The signed-in Admin user, shaped after Core's `GET /auth/me` and `GET /auth/grants` (docs/CORE-INTEGRATION.md §3, §4).
 *
 * - An **owner** owns one Company (`grants.companyId`).
 * - An **operator** has active Platform assignments (`grants.platformAssignments`). An assignment never implies
 *   company-wide access.
 * Organization-admin members are not Admin users.
 */
export type Actor = OwnerActor | OperatorActor;

interface ActorIdentity {
  readonly userId: string;
  /** Core's `email`: `null` for a phone-only identity. */
  readonly email: string | null;
  /** Core's `phone`, present only when Core has one (its `null` maps to absent: one way to say "no phone"). */
  readonly phone?: string;
  /**
   * Display name. Core's `/auth/me` returns no name (email and phone only), so the real session leaves it unset and the
   * UI falls back to the email. Only the demo owner has one.
   */
  readonly displayName?: string;
}

export interface OwnerActor extends ActorIdentity {
  readonly kind: 'owner';
  readonly companyId: CompanyId;
}

export interface OperatorActor extends ActorIdentity {
  readonly kind: 'operator';
  readonly platformAssignments: readonly PlatformId[];
}

/** How the shell names a person: display name, else email, else phone (a phone-only operator), else the user id. */
export const actorLabel = (actor: Actor): string =>
  actor.displayName ?? actor.email ?? actor.phone ?? actor.userId;
