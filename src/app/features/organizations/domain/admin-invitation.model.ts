import { OrganizationId } from '../../../core/context/scope.model';

/**
 * Organization-admin invitations (Auth, ADR-0029; source-verified in P3b-S3-0, docs/CORE-INTEGRATION.md §5):
 * `POST|GET /auth/organizations/:organizationId/admin-invitations`, `POST …/:invitationId/revoke`. An invitation is a
 * single-use code that lets a person join the Organization as an admin from the product app. Core never sends it: the
 * owner shares it. Everything here is pure.
 */

/** Core's derived status, in Core's precedence: consumed, revoked, expired, active. Machine values. */
export type AdminInvitationStatus = 'active' | 'consumed' | 'revoked' | 'expired';

/** One invitation as Core lists it: metadata only. Never the code, never the contact. */
export interface AdminInvitation {
  readonly id: string;
  /** Opaque, platform-defined audience label: user data, shown as is, never translated. */
  readonly invitationType: string;
  /** Whether acceptance is bound to one email or phone (the contact itself is never returned). */
  readonly contactBound: boolean;
  /** UTC instants, ISO 8601 with `Z`. */
  readonly expiresAt: string;
  readonly createdAt: string;
  /** The creating user's id (Core's `createdBy`). */
  readonly createdBy: string;
  readonly consumedAt: string | null;
  readonly revokedAt: string | null;
  readonly status: AdminInvitationStatus;
}

export interface AdminInvitationList {
  readonly organizationId: OrganizationId;
  /** Newest first, as Core orders them; no pagination. */
  readonly invitations: readonly AdminInvitation[];
}

/** Exactly Core's body (`CreateAdminInvitationDto`); an absent optional field is omitted, never `""` or `null`. */
export interface CreateAdminInvitationRequest {
  readonly invitationType: string;
  readonly expiresInMinutes?: number;
  readonly inviteeContact?: string;
}

/** Core's `201` answer. `code` is the plaintext, returned ONCE: it lives only in this answer and the dialog. */
export interface CreatedAdminInvitation {
  readonly id: string;
  readonly invitationType: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly contactBound: boolean;
  readonly code: string;
}

/** Core's `invitationType` rule (auth-service `onboarding/dto.ts`): a lowercase label; the literal `admin` is reserved. */
export const INVITATION_TYPE_PATTERN = /^(?!admin$)[a-z][a-z0-9_-]{0,31}$/;
export const INVITATION_TYPE_MAX = 32;

/**
 * The durations Admin offers (owner decision D-E), all inside Core's default deployed range (15 minutes to 7 days,
 * default 24 hours; `INVITATION_*_MINUTES`). A deployment may configure a narrower range: its `400` is handled.
 */
export const EXPIRY_PRESETS = [60, 1440, 4320, 10_080] as const;
export type ExpiryPreset = (typeof EXPIRY_PRESETS)[number];
export const DEFAULT_EXPIRY: ExpiryPreset = 1440;

/** Core's phone rule after normalization (auth-service `users.service.ts` `PHONE_RE`). */
export const PHONE_PATTERN = /^\+?[0-9]{8,15}$/;
export const CONTACT_MAX = 254;

export type TypeProblem = 'required' | 'reserved' | 'invalid';

/** Pure: why a typed invitation type is refused (as Core would), or `null`. Nothing is changed: lowercase is required. */
export function invitationTypeProblem(value: string): TypeProblem | null {
  if (value === '') return 'required';
  if (value === 'admin') return 'reserved';
  return INVITATION_TYPE_PATTERN.test(value) ? null : 'invalid';
}

export type ContactProblem = 'invalidPhone' | 'tooLong';

/**
 * Core's contact normalization (auth-service `invitation.service.ts` `contactHash`): with an `@` it is an email,
 * trimmed and lowercased (Core checks no further format); otherwise a phone, without spaces, parentheses or hyphens,
 * that must then match `PHONE_PATTERN`. Empty means "anyone with the code": the field is omitted.
 */
export function normaliseContact(
  typed: string,
): { readonly value: string | null } | { readonly problem: ContactProblem } {
  const trimmed = typed.trim();
  if (trimmed === '') return { value: null };
  if (trimmed.length > CONTACT_MAX) return { problem: 'tooLong' };
  if (trimmed.includes('@')) return { value: trimmed.toLowerCase() };
  const phone = trimmed.replace(/[\s()-]/g, '');
  return PHONE_PATTERN.test(phone) ? { value: phone } : { problem: 'invalidPhone' };
}

/** The request for valid form values: exactly Core's fields, the contact only when one is given. */
export function invitationRequestOf(
  invitationType: string,
  expiresInMinutes: ExpiryPreset,
  contact: string | null,
): CreateAdminInvitationRequest {
  return contact === null
    ? { invitationType, expiresInMinutes }
    : { invitationType, expiresInMinutes, inviteeContact: contact };
}

/** Who created it, as far as Admin can tell: only "you" is certain (`createdBy` is the session's own user id). */
export type CreatorLabel = 'you' | 'someoneElse';
export const creatorOf = (invitation: AdminInvitation, userId: string | null): CreatorLabel =>
  userId !== null && invitation.createdBy === userId ? 'you' : 'someoneElse';

/** What the person saw before an attempt whose answer was lost, and when it was sent. */
export interface CreateAttempt {
  readonly knownIds: ReadonlySet<string>;
  readonly sentAt: number;
  readonly userId: string;
}

/** Tolerance between the browser's and Core's clocks when comparing `createdAt` with the moment of sending. */
export const CLOCK_SKEW_MS = 5 * 60_000;

/**
 * After a lost create answer: the invitations that MAY be the one it created (never proven: Core has no idempotency
 * and no reference to match). New since the attempt (not in `knownIds`), still active, created by this user, and not
 * created before the attempt was sent (`createdAt`, with `CLOCK_SKEW_MS`).
 */
export function possibleFromAttempt(
  attempt: CreateAttempt,
  invitations: readonly AdminInvitation[],
): ReadonlySet<string> {
  return new Set(
    invitations
      .filter(
        (i) =>
          !attempt.knownIds.has(i.id) &&
          i.status === 'active' &&
          i.createdBy === attempt.userId &&
          Date.parse(i.createdAt) >= attempt.sentAt - CLOCK_SKEW_MS,
      )
      .map((i) => i.id),
  );
}
