import { Actor } from '../../../core/auth/actor';
import { CompanyDirectory, PlatformRef } from '../../../core/context/scope.model';
import { ViewState } from '../../../core/state/view-state';

/**
 * What Settings → Account (`/settings/account`, P9-S2) shows: the signed-in person's own account, from their session
 * only (Core's `/auth/me` and `/auth/grants`, ARCHITECTURE §11) and the shell's `ScopeContext`. No identity parameter
 * exists, so no one else's account can be asked for; no field is invented (Core keeps no display name, CF-53).
 */
export type AccountView =
  | { readonly kind: 'signedOut' }
  | {
      readonly kind: 'owner';
      readonly contact: AccountContact;
      /** The owner's Company, as the scope directory names it (a mock in demo builds, unavailable otherwise; CF-02). */
      readonly company: ViewState<CompanyAccess>;
    }
  | {
      readonly kind: 'operator';
      readonly contact: AccountContact;
      /** The Platforms the operator may work on now: their current grants, named by the scope directory. */
      readonly platforms: ViewState<readonly PlatformRef[]>;
    };

/** Core's contact fields: `email` is `null` for a phone-only identity; a phone exists only when Core has one. */
export interface AccountContact {
  readonly email: string | null;
  readonly phone: string | null;
}

export interface CompanyAccess {
  readonly name: string;
  readonly platformCount: number;
}

/**
 * Pure: `(session actor, ScopeContext's directory and Platforms) → view`. An operator's list is filtered by the
 * actor's CURRENT assignments, so a list loaded before a grants refresh never shows a Platform that is no longer
 * granted; it is never widened beyond them. A list that cannot be read stays an error, never an invented grant.
 */
export function accountView(
  actor: Actor | null,
  directory: ViewState<CompanyDirectory>,
  platforms: ViewState<readonly PlatformRef[]>,
): AccountView {
  if (actor === null) return { kind: 'signedOut' };
  const contact: AccountContact = { email: actor.email, phone: actor.phone ?? null };
  if (actor.kind === 'owner') {
    return {
      kind: 'owner',
      contact,
      company:
        directory.status === 'success'
          ? {
              status: 'success',
              data: {
                name: directory.data.company.name,
                platformCount: directory.data.platforms.length,
              },
            }
          : directory,
    };
  }
  if (actor.platformAssignments.length === 0) {
    return { kind: 'operator', contact, platforms: { status: 'empty' } };
  }
  if (platforms.status !== 'success') return { kind: 'operator', contact, platforms };
  const granted = platforms.data.filter((p) => actor.platformAssignments.includes(p.id));
  return {
    kind: 'operator',
    contact,
    platforms: granted.length > 0 ? { status: 'success', data: granted } : { status: 'empty' },
  };
}
