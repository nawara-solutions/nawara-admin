import { canEnterPlatform } from '../access/capability-policy';
import { Actor } from '../auth/actor';
import { ViewState } from '../state/view-state';
import { AdminScope, PlatformRef } from './scope.model';

/**
 * Whether the Platform in the URL can be shown, before anything about it is requested (every platform-scope page):
 * - `checking`: the actor's Platforms are still loading;
 * - `directoryUnavailable`: they could not be listed (an outage, never an access refusal; "Try again");
 * - `notAccessible`: unknown, or outside the actor's scope (one state, as Core collapses both into `404`);
 * - `granted`: the actor may enter it (UX; Core authorizes every request).
 */
export type PlatformAccess =
  | { readonly status: 'checking' }
  | { readonly status: 'directoryUnavailable' }
  | { readonly status: 'notAccessible' }
  | { readonly status: 'granted'; readonly platform: PlatformRef };

/** Pure: the scope from the URL, the actor's Platforms (`ScopeContext.platforms`) and the actor → the access state. */
export function platformAccessOf(
  scope: AdminScope,
  platforms: ViewState<readonly PlatformRef[]>,
  actor: Actor | null,
): PlatformAccess {
  if (scope.kind !== 'platform') return { status: 'notAccessible' };
  switch (platforms.status) {
    case 'idle':
    case 'loading':
      return { status: 'checking' };
    case 'error':
      return { status: 'directoryUnavailable' };
    case 'success': {
      const platform = platforms.data.find((p) => p.id === scope.platformId);
      const allowed = canEnterPlatform(
        actor,
        scope.platformId,
        platforms.data.map((p) => p.id),
      );
      return platform && allowed ? { status: 'granted', platform } : { status: 'notAccessible' };
    }
    default:
      return { status: 'notAccessible' };
  }
}
