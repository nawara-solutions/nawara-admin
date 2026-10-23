import { OrganizationId, PlatformId } from '../../core/context/scope.model';
import { MemberIdentityRecord, MembershipRecord } from './records';

/**
 * Synthetic member identities and Organization memberships for the demo world (P5-S1), generated deterministically
 * from each Organization's figures, so every count the dashboards showed before is reproduced exactly from records:
 * `active` memberships are the "memberships" figure, `pending` ones the "requests awaiting approval".
 *
 * Shapes follow Core's membership list (auth-service `membership.service.ts` `listByStatus`; P5-S0). People carry no
 * name (Core has none) and only fictional contacts: `member-NNNN@example.invalid`, or a phone in the unassigned `+999`
 * range. A few people hold memberships in several Organizations; each Organization has exactly one explicit
 * organization admin (a membership flag, never implied by membership). Owners and operators are never members.
 */

export interface MembershipSeedSpec {
  readonly organizationId: OrganizationId;
  readonly platformId: PlatformId;
  /** Milliseconds since the epoch: no membership predates its Organization. */
  readonly createdAt: number;
  readonly active: number;
  readonly pending: number;
  /** How many rejected requests to add (not counted by any figure). */
  readonly rejected: number;
  /** How many revoked memberships to add (Core cannot list them; not counted). */
  readonly revoked: number;
  /** When the organization admin joined (an accepted admin invitation), if known; otherwise early in its life. */
  readonly adminJoinedAt?: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Opaque, platform-defined audience labels (ADR-0030); the admin's matches the seed's admin invitations. `members`
 * rotate over active memberships; `requests` is the audience of pending (and so of rejected) requests.
 *
 * Nawara School's standard join codes (owner policy, 2026-10-23): `student` codes do not require approval (the member
 * is active at once), `teacher` codes do; so School requests are teachers. This is a product default, not a Core rule:
 * the code's `requiresApproval` decides, never the label, and nothing in Admin branches on an audience (a pending
 * `student` from a code that requires approval is valid). Join codes themselves are not part of the demo world.
 */
const AUDIENCES = {
  school: { members: ['student', 'teacher'], requests: 'teacher', admin: 'org_admin' },
  drive: { members: ['learner', 'instructor'], requests: 'learner', admin: 'fleet_manager' },
} as const;

/** Every N-th active membership of an Organization (after the first) reuses a person from an earlier Organization. */
const SHARE_EVERY = 12;

const userId = (n: number) => `8c4f2e10-6b3a-4d5e-9f01-${n.toString(16).padStart(12, '0')}`;
const membershipId = (n: number) => `2b6e9d40-1a7c-4e3f-8d21-${n.toString(16).padStart(12, '0')}`;

function identity(n: number): MemberIdentityRecord {
  const phoneOnly = n % 7 === 3;
  return {
    id: userId(n),
    email: phoneOnly ? null : `member-${n.toString().padStart(4, '0')}@example.invalid`,
    phone: phoneOnly ? `+9995000${n.toString().padStart(5, '0')}` : null,
    contactVerified: n % 9 !== 4,
  };
}

const iso = (ms: number) => new Date(Math.floor(ms)).toISOString();

export function seedMemberships(
  specs: readonly MembershipSeedSpec[],
  schoolPlatform: PlatformId,
  now: number,
): { readonly members: MemberIdentityRecord[]; readonly memberships: MembershipRecord[] } {
  const members: MemberIdentityRecord[] = [];
  const memberships: MembershipRecord[] = [];
  let reuse = 0;
  const person = () => {
    const record = identity(members.length + 1);
    members.push(record);
    return record.id;
  };
  const add = (m: Omit<MembershipRecord, 'id'>) =>
    memberships.push({ id: membershipId(memberships.length + 1), ...m });

  for (const spec of specs) {
    const audiences = spec.platformId === schoolPlatform ? AUDIENCES.school : AUDIENCES.drive;
    const life = Math.max(now - spec.createdAt, MINUTE);
    const known = members.length;
    const base = {
      organizationId: spec.organizationId,
      approvedAt: null,
      rejectedAt: null,
      revokedAt: null,
      isOrganizationAdmin: false,
    };
    // Active: the first is the organization admin; the others joined across the Organization's life.
    for (let j = 0; j < spec.active; j++) {
      const shared = j > 0 && j % SHARE_EVERY === 6 && known > 0;
      const user = shared ? members[reuse++ % known]!.id : person();
      if (j === 0) {
        const joined = spec.adminJoinedAt ?? spec.createdAt + life * 0.05;
        add({
          ...base,
          userId: user,
          status: 'active',
          requestedAt: iso(joined),
          approvedAt: iso(joined),
          isOrganizationAdmin: true,
          audience: audiences.admin,
        });
        continue;
      }
      const requested = spec.createdAt + (life * (j + 1)) / (spec.active + 2);
      add({
        ...base,
        userId: user,
        status: 'active',
        requestedAt: iso(requested),
        approvedAt: iso(requested + Math.min(30 * MINUTE, (now - requested) / 4)),
        audience: audiences.members[j % audiences.members.length]!,
      });
    }
    // Pending: recent requests, newest last (Core lists oldest request first).
    const step = Math.min(life / (spec.pending + 2), 6 * HOUR);
    for (let p = 0; p < spec.pending; p++)
      add({
        ...base,
        userId: person(),
        status: 'pending',
        requestedAt: iso(now - (spec.pending - p) * step),
        audience: audiences.requests,
      });
    for (let r = 0; r < spec.rejected; r++) {
      const requested = spec.createdAt + life * (0.5 + r * 0.01);
      add({
        ...base,
        userId: person(),
        status: 'rejected',
        requestedAt: iso(requested),
        rejectedAt: iso(requested + Math.min(HOUR, (now - requested) / 4)),
        audience: audiences.requests,
      });
    }
    for (let v = 0; v < spec.revoked; v++) {
      const requested = spec.createdAt + life * (0.2 + v * 0.01);
      add({
        ...base,
        userId: person(),
        status: 'revoked',
        requestedAt: iso(requested),
        approvedAt: iso(requested + Math.min(10 * MINUTE, (now - requested) / 8)),
        revokedAt: iso(requested + Math.min(HOUR, (now - requested) / 2)),
        audience: audiences.members[1 % audiences.members.length]!,
      });
    }
  }
  return { members, memberships };
}
