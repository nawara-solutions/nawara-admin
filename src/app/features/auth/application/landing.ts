import { can } from '../../../core/access/capability-policy';
import { Actor, OperatorActor } from '../../../core/auth/actor';
import { Grants, Identity } from '../../../core/auth/auth.model';
import { PlatformId, platformId } from '../../../core/context/scope.model';

export const OWNER_LANDING = '/overview';
export const PLATFORM_CHOICE_PATH = '/login/platform';
export const NO_ACCESS_PATH = '/login/no-access';

/** Where a signed-in account goes. Authentication alone never decides it: only `/auth/me` and `/auth/grants` do. */
export type Landing =
  | { readonly kind: 'enter'; readonly actor: Actor; readonly url: string }
  | { readonly kind: 'choosePlatform'; readonly actor: OperatorActor }
  | { readonly kind: 'noAccess'; readonly contact: string };

/**
 * The default landing (A4 design; frontend proposals until reconciled with grants, docs/ROADMAP.md):
 *
 * - an owner with a Company → the Company overview;
 * - an operator with one assigned Platform → that Platform; with several → the platform choice;
 * - anything else (no admin tier, an operator without assignments, an owner without a Company) → no administrative access.
 *
 * Pure. A requested page (return URL) is considered separately, by `authorizedReturn`.
 */
export function resolveLanding(identity: Identity, grants: Grants): Landing {
  const person = {
    userId: identity.userId,
    email: identity.email,
    // Core's `phone: null` maps to an absent phone on the actor (Actor has one representation of "no phone").
    ...(identity.phone !== null ? { phone: identity.phone } : {}),
    ...(identity.displayName ? { displayName: identity.displayName } : {}),
  };

  if (identity.adminTier === 'owner' && grants.companyId !== null) {
    const actor: Actor = { kind: 'owner', ...person, companyId: grants.companyId };
    return { kind: 'enter', actor, url: OWNER_LANDING };
  }

  if (identity.adminTier === 'operator' && grants.platformAssignments.length > 0) {
    const actor: OperatorActor = {
      kind: 'operator',
      ...person,
      platformAssignments: grants.platformAssignments,
    };
    const [only, ...others] = grants.platformAssignments;
    if (only !== undefined && others.length === 0) {
      return { kind: 'enter', actor, url: `/platforms/${only}` };
    }
    return { kind: 'choosePlatform', actor };
  }

  return { kind: 'noAccess', contact: identity.email ?? identity.phone ?? identity.userId };
}

/** A requested page this actor may open: a company page, or a Platform scope still to confirm with Core. */
export type ReturnTarget =
  | { readonly kind: 'page'; readonly url: string }
  | { readonly kind: 'platform'; readonly url: string; readonly platformId: PlatformId };

const PLATFORM_SCOPE = /^\/platforms\/([^/]+)$/;

/**
 * Whether the signed-in actor may return to the page requested before sign-in. `returnUrl` must already have passed
 * `safeReturnUrl` (internal and path-only); that alone is not enough. Only known Admin routes are followed, each by the
 * capability it requires:
 *
 * - `/overview`, `/platforms`: Company-wide pages, the owner only (`can`), never an operator;
 * - `/platforms/:platformId`: an operator only for an assigned Platform; then, for anyone, Core's platform-access check
 *   (`GET /auth/platform-access/:platformId`) confirms the scope before navigating (`kind: 'platform'`).
 *
 * Anything else returns `null`: the default landing applies. Pure.
 */
export function authorizedReturn(actor: Actor, returnUrl: string | null): ReturnTarget | null {
  if (returnUrl === null) return null;
  if (returnUrl === OWNER_LANDING) {
    return can(actor, 'company.overview.view') ? { kind: 'page', url: returnUrl } : null;
  }
  if (returnUrl === '/platforms') {
    return can(actor, 'company.platforms.view') ? { kind: 'page', url: returnUrl } : null;
  }
  const scope = PLATFORM_SCOPE.exec(returnUrl)?.[1];
  if (scope === undefined) return null;
  const id = platformId(scope);
  if (actor.kind === 'operator' && !actor.platformAssignments.includes(id)) return null;
  return { kind: 'platform', url: returnUrl, platformId: id };
}
