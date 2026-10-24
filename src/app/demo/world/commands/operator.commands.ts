import { PlatformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { CommandOutcome } from '../demo-world';
import { AdminIdentityId, DemoWorldTables, PlatformAssignmentRecord } from '../records';
import { grantsOf, isActiveAssignment, isCompanyPlatform, operatorProfileOf } from '../selectors';

/**
 * Operator commands of the simulated Core (Auth): the operator's own contact confirmation (Core's public
 * `POST /auth/admin/operators/confirm`), so the confirmed state the owner's directory shows is the one the sign-in flow
 * wrote; and the owner's Platform assignment grant and removal (P6-S2). Blocking and creating come with their own slices.
 */

/**
 * Like Core's `confirm`: sets `contactVerifiedAt` once; an already confirmed contact is left as it is (Core answers 204
 * without changing anything). A blocked or unknown operator is refused (Core: the generic 401, decided by the caller).
 */
export function confirmOperatorContact(
  operator: AdminIdentityId,
  now: number,
): (world: DemoWorldTables) => CommandOutcome<{ readonly confirmedAt: string }> {
  return (world) => {
    const profile = world.operators.find((o) => o.id === operator);
    if (profile === undefined || profile.blocked)
      return {
        ok: false,
        error: { kind: 'unauthenticated', code: 'operator_code_invalid', status: 401 },
      };
    if (profile.contactConfirmedAt !== null)
      return { ok: true, world, result: { confirmedAt: profile.contactConfirmedAt } };
    const confirmedAt = new Date(now).toISOString();
    return {
      ok: true,
      world: {
        ...world,
        operators: world.operators.map((o) =>
          o.id === operator ? { ...o, contactConfirmedAt: confirmedAt } : o,
        ),
      },
      result: { confirmedAt },
    };
  };
}

/** What a Platform assignment change is about: who asks, for which operator and Platform, at what instant. */
export interface PlatformAssignmentChange {
  /** The asking identity (the signed-in session's business identity). */
  readonly actor: AdminIdentityId | null;
  readonly operatorId: AdminIdentityId;
  readonly platformId: PlatformId;
  readonly now: number;
}

/** Stable, UUID-shaped ids for assignments created at run time (never a seed id: those end in two decimal digits). */
export const createdAssignmentId = (sequence: number): string =>
  `6a2e9c40-1b3d-4e5f-8a7b-${(0x1000 + sequence).toString(16).padStart(12, '0')}`;

const FORBIDDEN: AppError = { kind: 'forbidden', code: 'forbidden', status: 403 };
const NOT_FOUND: AppError = { kind: 'not_found', code: 'not_found', status: 404 };

/**
 * Core's checks shared by grant and removal (`assignment.service.ts`): the actor is the Company's owner (anyone else:
 * the guard's `403`, operators on their own record included), and the operator and the Platform both belong to the
 * owner's Company (otherwise one collapsed `404`, whichever is foreign or unknown).
 */
function refusal(world: DemoWorldTables, change: PlatformAssignmentChange): AppError | null {
  if (change.actor === null || grantsOf(world, change.actor).companyId !== world.company.id)
    return FORBIDDEN;
  if (operatorProfileOf(world, change.operatorId) === undefined) return NOT_FOUND;
  if (!isCompanyPlatform(world, change.platformId)) return NOT_FOUND;
  return null;
}

const activeRecord = (world: DemoWorldTables, change: PlatformAssignmentChange) =>
  world.assignments.find(
    (a) =>
      a.operatorId === change.operatorId &&
      a.platformId === change.platformId &&
      isActiveAssignment(a),
  );

/**
 * Like Core's `grant`: an active assignment of this operator to this Platform already exists → `409
 * assignment_conflict` (Core's `platform_assignment_one_active`; nothing changes, so the step-up stays unspent); else
 * exactly ONE new active record is appended, granted by the owner now, and one `operator.assigned` activity recorded.
 * Removed records are never touched. Blocked or unconfirmed operators may be granted, as in Core.
 */
export function grantPlatformAssignment(
  change: PlatformAssignmentChange,
): (world: DemoWorldTables) => CommandOutcome<PlatformAssignmentRecord> {
  return (world) => {
    const refused = refusal(world, change);
    if (refused !== null) return { ok: false, error: refused };
    if (activeRecord(world, change) !== undefined)
      return {
        ok: false,
        error: { kind: 'conflict', code: 'assignment_conflict', status: 409 },
      };
    const sequence = world.sequence + 1;
    const at = new Date(change.now).toISOString();
    const record: PlatformAssignmentRecord = {
      id: createdAssignmentId(sequence),
      operatorId: change.operatorId,
      platformId: change.platformId,
      assignedBy: world.company.ownerId,
      assignedAt: at,
      revokedAt: null,
      revokedBy: null,
    };
    return {
      ok: true,
      world: {
        ...world,
        sequence,
        assignments: [...world.assignments, record],
        activity: [
          ...world.activity,
          {
            id: `operator-activity-assigned-${sequence}`,
            platformId: change.platformId,
            organizationId: null,
            action: 'operator.assigned',
            occurredAt: at,
          },
        ],
      },
      result: record,
    };
  };
}

/**
 * Like Core's `revoke`: only the CURRENT active record of this operator and Platform is marked removed (`revokedAt`,
 * `revokedBy`), never deleted; none → the collapsed `404` (never assigned, already removed: Core rolls back, so the
 * step-up stays unspent). One `operator.unassigned` activity is recorded. Nothing else changes: the operator's account
 * and sessions, memberships, Organization-admin flags and commercial records are not Auth assignment data.
 */
export function revokePlatformAssignment(
  change: PlatformAssignmentChange,
): (world: DemoWorldTables) => CommandOutcome<PlatformAssignmentRecord> {
  return (world) => {
    const refused = refusal(world, change);
    if (refused !== null) return { ok: false, error: refused };
    const current = activeRecord(world, change);
    if (current === undefined) return { ok: false, error: NOT_FOUND };
    const sequence = world.sequence + 1;
    const at = new Date(change.now).toISOString();
    const revoked: PlatformAssignmentRecord = {
      ...current,
      revokedAt: at < current.assignedAt ? current.assignedAt : at,
      revokedBy: world.company.ownerId,
    };
    return {
      ok: true,
      world: {
        ...world,
        sequence,
        assignments: world.assignments.map((a) => (a.id === current.id ? revoked : a)),
        activity: [
          ...world.activity,
          {
            id: `operator-activity-unassigned-${sequence}`,
            platformId: change.platformId,
            organizationId: null,
            action: 'operator.unassigned',
            occurredAt: at,
          },
        ],
      },
      result: revoked,
    };
  };
}
