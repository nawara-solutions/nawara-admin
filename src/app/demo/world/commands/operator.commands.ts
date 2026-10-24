import { PlatformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { CommandOutcome } from '../demo-world';
import { AdminIdentityId, DemoWorldTables, PlatformAssignmentRecord } from '../records';
import { grantsOf, isActiveAssignment, isCompanyPlatform, operatorProfileOf } from '../selectors';

/**
 * Operator commands of the simulated Core (Auth): the operator's own contact confirmation (Core's public
 * `POST /auth/admin/operators/confirm`), so the confirmed state the owner's directory shows is the one the sign-in flow
 * wrote; the owner's Platform assignment grant and removal (P6-S2); and the owner's block and unblock of an operator
 * account (P6-S3). Creating an operator comes with its own slice.
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

/** Who blocks or unblocks which operator, at what instant (P6-S3). */
export interface OperatorAccountChange {
  /** The asking identity (the signed-in session's business identity). */
  readonly actor: AdminIdentityId | null;
  readonly operatorId: AdminIdentityId;
  readonly now: number;
}

/** What a block or unblock did to the account: whether its state changed (a repeat changes nothing). */
export interface OperatorAccountResult {
  readonly operatorId: AdminIdentityId;
  readonly blocked: boolean;
  readonly changed: boolean;
}

/**
 * Like Core's `setBlocked` (`operator-admin.service.ts`): the owner of the Company only (anyone else, operators on their
 * own record included: `403`), an operator of that Company only (collapsed `404`). Sets the account's `blocked` flag and
 * nothing else in the world: assignments (kept, ineffective while blocked), the contact and its confirmation, memberships
 * and commercial records are untouched; unblocking never confirms anyone. Core writes its audit record on EVERY call, a
 * repeat of the current state included, so every committed call records one Company-level `operator.blocked` /
 * `operator.unblocked` activity (subject: the operator's id, never a contact), while a repeat leaves the account as it is.
 *
 * What Core does outside the account row (ending sessions, cancelling unused codes) is sign-in state, never the world's:
 * the mock adapter applies it in `DemoAuthState` once this commits.
 */
export function setOperatorBlocked(
  change: OperatorAccountChange,
  blocked: boolean,
): (world: DemoWorldTables) => CommandOutcome<OperatorAccountResult> {
  return (world) => {
    if (change.actor === null || grantsOf(world, change.actor).companyId !== world.company.id)
      return { ok: false, error: FORBIDDEN };
    const profile = operatorProfileOf(world, change.operatorId);
    if (profile === undefined) return { ok: false, error: NOT_FOUND };
    const sequence = world.sequence + 1;
    const changed = profile.blocked !== blocked;
    return {
      ok: true,
      world: {
        ...world,
        sequence,
        operators: changed
          ? world.operators.map((o) => (o.id === change.operatorId ? { ...o, blocked } : o))
          : world.operators,
        activity: [
          ...world.activity,
          {
            id: `operator-activity-${blocked ? 'blocked' : 'unblocked'}-${sequence}`,
            platformId: null,
            organizationId: null,
            action: blocked ? 'operator.blocked' : 'operator.unblocked',
            subjectId: change.operatorId,
            occurredAt: new Date(change.now).toISOString(),
          },
        ],
      },
      result: { operatorId: change.operatorId, blocked, changed },
    };
  };
}

/** Core's `POST /auth/admin/operators/:id/block` (an emergency control: no step-up). */
export const blockOperator = (change: OperatorAccountChange) => setOperatorBlocked(change, true);

/** Core's `POST /auth/admin/operators/:id/unblock`. */
export const unblockOperator = (change: OperatorAccountChange) => setOperatorBlocked(change, false);
