import { AdminIdentityId, DemoWorldTables } from '../records';
import { CommandOutcome } from '../demo-world';

/**
 * Operator commands of the simulated Core (Auth). P6-S1 has no owner-facing operator change: the only command is the
 * operator's own contact confirmation (Core's public `POST /auth/admin/operators/confirm`), so the confirmed state the
 * owner's directory shows is the one the sign-in flow wrote. Granting, removing, blocking and creating come with their
 * own slices.
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
