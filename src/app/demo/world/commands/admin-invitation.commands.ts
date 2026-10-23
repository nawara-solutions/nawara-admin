import { AppError } from '../../../core/errors/app-error';
import { OrganizationId } from '../../../core/context/scope.model';
import { CommandOutcome } from '../demo-world';
import { AdminIdentityId, AdminInvitationRecord, DemoWorldTables } from '../records';

/**
 * Organization-admin invitation commands of the demo world (development builds only), applied through
 * `DemoWorld.commit`. They follow the source-verified Auth contract (P3b-S3-0; auth-service `onboarding/dto.ts`,
 * `onboarding/invitation.service.ts`, `membership/organization.controller.ts`). A record never holds the code or the
 * contact: Core keeps only HMACs, the demo keeps nothing.
 */

/** Core's `400 validation_error` (Admin's `validation` kind carries no code: it never branches on one). */
const validation = (field: string): AppError => ({
  kind: 'validation',
  messages: [`${field} is not valid`],
  status: 400,
});
const NOT_FOUND: AppError = { kind: 'not_found', code: 'not_found', status: 404 };

/** Core's DTO bounds and its default deployed duration range (`INVITATION_*_MINUTES`: 15 minutes, 24 h, 7 days). */
export const INVITATION_DTO_MAX_MINUTES = 43_200;
export const DEMO_INVITATION_MINUTES = { min: 15, default: 1440, max: 10_080 } as const;

const TYPE = /^(?!admin$)[a-z][a-z0-9_-]{0,31}$/;
const PHONE = /^\+?[0-9]{8,15}$/;
const ALLOWED = ['invitationType', 'expiresInMinutes', 'inviteeContact'];

export interface NormalisedInvitationCreate {
  readonly invitationType: string;
  readonly minutes: number;
  /** Whether a contact was given; the contact itself goes no further. */
  readonly contactBound: boolean;
}

/**
 * Core's create validation, in its order: the DTO (unknown fields refused, `forbidNonWhitelisted`; the type pattern;
 * `expiresInMinutes` a JSON integer 1–43,200; `inviteeContact` a string of at most 254), then the configured duration
 * range, then the contact (an `@` is an email; otherwise a phone that must match after normalization). Every refusal
 * is `400 validation_error`.
 */
export function normaliseInvitationCreate(raw: unknown): NormalisedInvitationCreate | AppError {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return validation('body');
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) if (!ALLOWED.includes(key)) return validation(key);
  const type = body['invitationType'];
  if (typeof type !== 'string' || !TYPE.test(type)) return validation('invitationType');
  const minutes = body['expiresInMinutes'];
  if (
    minutes !== undefined &&
    (typeof minutes !== 'number' ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > INVITATION_DTO_MAX_MINUTES)
  )
    return validation('expiresInMinutes');
  const contact = body['inviteeContact'];
  if (contact !== undefined && (typeof contact !== 'string' || contact.length > 254))
    return validation('inviteeContact');
  const duration = typeof minutes === 'number' ? minutes : DEMO_INVITATION_MINUTES.default;
  if (duration < DEMO_INVITATION_MINUTES.min || duration > DEMO_INVITATION_MINUTES.max)
    return validation('expiresInMinutes');
  // An empty string is "no binding", as in Core (`if (dto.inviteeContact)`).
  if (typeof contact === 'string' && contact !== '' && !contact.includes('@')) {
    if (!PHONE.test(contact.replace(/[\s()-]/g, ''))) return validation('inviteeContact');
  }
  return {
    invitationType: type,
    minutes: duration,
    contactBound: typeof contact === 'string' && contact !== '',
  };
}

/**
 * Core's authority over invitations (`InvitationService.authorize`): the owner of the Organization's Company (an
 * organization admin is not an Admin actor). Anyone else, operators included, and an unknown Organization: one `404`.
 */
export function mayManageInvitations(
  world: DemoWorldTables,
  actor: AdminIdentityId,
  organization: OrganizationId,
): boolean {
  const record = world.organizations.find((o) => o.id === organization);
  const platform = record && world.platforms.find((p) => p.id === record.platformId);
  return (
    platform !== undefined &&
    platform.companyId === world.company.id &&
    world.company.ownerId === actor
  );
}

/** The ids of run-time invitations: UUID-shaped, numbered from the world's sequence. */
export const runtimeInvitationId = (n: number) =>
  `7b9c4e21-0d3a-4f5b-8c6d-${n.toString(16).padStart(12, '0')}`;

export interface CreateAdminInvitationInput {
  readonly organizationId: OrganizationId;
  readonly request: NormalisedInvitationCreate;
  readonly actor: AdminIdentityId;
  /** The session's user id: Core's `createdBy`. */
  readonly createdBy: string;
  readonly now: number;
}

/** Adds one active invitation (no code, no contact) and a simulated `admin_invitation.created` activity record. */
export function createAdminInvitation(
  world: DemoWorldTables,
  input: CreateAdminInvitationInput,
): CommandOutcome<AdminInvitationRecord> {
  if (!mayManageInvitations(world, input.actor, input.organizationId))
    return { ok: false, error: NOT_FOUND };
  const organization = world.organizations.find((o) => o.id === input.organizationId)!;
  const sequence = world.sequence + 1;
  const createdAt = new Date(input.now).toISOString();
  const invitation: AdminInvitationRecord = {
    id: runtimeInvitationId(sequence),
    organizationId: input.organizationId,
    invitationType: input.request.invitationType,
    contactBound: input.request.contactBound,
    createdAt,
    expiresAt: new Date(input.now + input.request.minutes * 60_000).toISOString(),
    createdBy: input.createdBy,
    consumedAt: null,
    revokedAt: null,
    revokedBy: null,
  };
  return {
    ok: true,
    result: invitation,
    world: {
      ...world,
      sequence,
      adminInvitations: [...world.adminInvitations, invitation],
      activity: [
        ...world.activity,
        {
          id: `invitation-activity-created-${sequence}`,
          platformId: organization.platformId,
          organizationId: organization.id,
          action: 'admin_invitation.created',
          occurredAt: createdAt,
        },
      ],
    },
  };
}

export interface RevokeAdminInvitationInput {
  readonly organizationId: OrganizationId;
  readonly invitationId: string;
  readonly actor: AdminIdentityId;
  readonly revokedBy: string;
  readonly now: number;
}

/**
 * Revokes an unused invitation: Core's conditional update (same Organization, not consumed, not revoked; an EXPIRED one
 * is revocable). Anything else, including an already used or revoked invitation or one of another Organization, is
 * the same `404`. Memberships are untouched: an admin who already joined keeps their access.
 */
export function revokeAdminInvitation(
  world: DemoWorldTables,
  input: RevokeAdminInvitationInput,
): CommandOutcome<AdminInvitationRecord> {
  if (!mayManageInvitations(world, input.actor, input.organizationId))
    return { ok: false, error: NOT_FOUND };
  const current = world.adminInvitations.find(
    (i) =>
      i.id === input.invitationId &&
      i.organizationId === input.organizationId &&
      i.consumedAt === null &&
      i.revokedAt === null,
  );
  if (current === undefined) return { ok: false, error: NOT_FOUND };
  const organization = world.organizations.find((o) => o.id === input.organizationId)!;
  const sequence = world.sequence + 1;
  const revokedAt = new Date(input.now).toISOString();
  const invitation: AdminInvitationRecord = { ...current, revokedAt, revokedBy: input.revokedBy };
  return {
    ok: true,
    result: invitation,
    world: {
      ...world,
      sequence,
      adminInvitations: world.adminInvitations.map((i) => (i.id === current.id ? invitation : i)),
      activity: [
        ...world.activity,
        {
          id: `invitation-activity-revoked-${sequence}`,
          platformId: organization.platformId,
          organizationId: organization.id,
          action: 'admin_invitation.revoked',
          occurredAt: revokedAt,
        },
      ],
    },
  };
}
