import { PlatformId } from '../../../core/context/scope.model';

/**
 * Platform operators and their Platform access (`/operators`, company scope, the owner only; P6).
 *
 * Two contracts with DIFFERENT Core availability (P6-S0, Core `750eb21`):
 * - The operator directory and one operator's account (`OperatorSummary`): PROVISIONAL frontend model. Core has no route
 *   that lists a Company's operators or reads one operator's account or state (CF-03); only a mock serves it.
 * - One operator's assignment history (`PlatformAssignment`): Core's verified answer of
 *   `GET /auth/admin/operators/:id/platform-assignments` (owner only), field for field. No HTTP adapter is authorized yet.
 */

/** An operator's one contact (Core: exactly one email or one phone; no name exists). User data: never translated. */
export type OperatorContact =
  | { readonly kind: 'email'; readonly email: string }
  | { readonly kind: 'phone'; readonly phone: string };

/**
 * The account state the provisional directory shows. Core keeps these facts (`user.isActive`,
 * `operator.contactVerifiedAt`) but exposes neither to the owner (CF-03): demo data only.
 * - `canSignIn`: contact confirmed, not blocked;
 * - `awaitingConfirmation`: created, contact not confirmed (no working code until it is);
 * - `blocked`: blocked by the owner (sign-in refused; Platform assignments are kept).
 */
export type OperatorAccountState = 'canSignIn' | 'awaitingConfirmation' | 'blocked';

export const ACCOUNT_STATES: readonly OperatorAccountState[] = [
  'canSignIn',
  'awaitingConfirmation',
  'blocked',
];

/** One operator of the Company, as the provisional directory and detail read describe it. */
export interface OperatorSummary {
  readonly id: string;
  readonly contact: OperatorContact;
  readonly accountState: OperatorAccountState;
  /** The Platforms the operator is actively assigned to (each grants Platform-scoped authority). */
  readonly activePlatformIds: readonly PlatformId[];
  /** UTC instant, ISO 8601 with `Z`. */
  readonly createdAt: string;
}

/**
 * One record of an operator's assignment history, exactly as Core answers it (owner only, oldest first): active, or
 * removed (`revokedAt`, `revokedBy`); a re-grant is a new record. `assignedBy` and `revokedBy` are the Company owner's
 * user id (Core derives them from the session; one owner per Company).
 */
export interface PlatformAssignment {
  readonly id: string;
  readonly platformId: PlatformId;
  readonly assignedBy: string;
  /** UTC instants, ISO 8601 with `Z`. */
  readonly assignedAt: string;
  readonly revokedAt: string | null;
  readonly revokedBy: string | null;
  readonly active: boolean;
}

/** The contact as text: the email, else the phone (always shown left to right, isolated). */
export const contactText = (contact: OperatorContact): string =>
  contact.kind === 'email' ? contact.email : contact.phone;
