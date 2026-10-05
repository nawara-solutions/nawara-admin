import { Actor } from '../auth/actor';
import { platformPath } from '../context/scope-context';
import { FORBIDDEN_PATH } from './access.guards';

/**
 * Where "home" is inside the workspace (the shell's root, the breadcrumb home link):
 *
 * - an owner: the Company overview;
 * - an operator with one assigned Platform: that Platform; with several: the platform choice;
 * - an operator with no assigned Platform (for example after losing assignments): the existing access-denied page,
 *   never the owner's Company overview.
 *
 * Authentication alone never grants workspace entry: at sign-in, an account without usable Admin access is sent to the
 * no-access page and no workspace session is opened (`resolveLanding`). Navigation only: pages are still guarded, the
 * platform-access check still applies to requested pages, and Core authorizes every request.
 */
export function homePath(actor: Actor | null): string {
  if (actor?.kind !== 'operator') return '/overview';
  const [only, ...others] = actor.platformAssignments;
  if (only === undefined) return FORBIDDEN_PATH;
  return others.length === 0 ? platformPath(only) : '/login/platform';
}
