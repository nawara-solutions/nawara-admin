import { Injectable, computed, inject, signal } from '@angular/core';
import { APP_ENVIRONMENT, isDemo } from '../config/app-environment';
import { PlatformId } from '../context/scope.model';
import { Actor } from './actor';

export type SessionState =
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly actor: Actor; readonly origin: 'demo' };

/**
 * The session boundary (docs/ARCHITECTURE.md §11). The sign-in flow (features/auth) establishes it once Core's
 * `/auth/me` and `/auth/grants` have been resolved into an `Actor`, never from the authentication answer alone.
 *
 * Demo sessions are restored from session storage in this tab. Production authentication remains unavailable until
 * the Core adapter and its session strategy are implemented. No tokens or credentials are stored here.
 *
 * This is UX state. It is not security: Core authorizes every request from the bearer it receives.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly environment = inject(APP_ENVIRONMENT);
  private readonly current = signal<SessionState>(this.restoreDemo());

  readonly state = this.current.asReadonly();
  readonly actor = computed<Actor | null>(() => {
    const state = this.current();
    return state.status === 'signed-in' ? state.actor : null;
  });
  /**
   * Which session this is: increments on every sign-in and sign-out (never on a grants refresh), so an answer requested
   * in one session is recognised, and dropped, once another has started.
   */
  private readonly epochs = signal(0);
  readonly epoch = this.epochs.asReadonly();

  readonly isDemo = computed(() => {
    const state = this.current();
    return state.status === 'signed-in' && state.origin === 'demo';
  });

  /** Signs in the actor resolved by the sign-in flow. Refused unless this build enables demo data (see above). */
  establish(actor: Actor): void {
    if (!isDemo(this.environment)) {
      throw new Error('Sign-in is not available in this build.');
    }
    this.current.set({ status: 'signed-in', actor, origin: 'demo' });
    this.persistDemo(actor);
    this.epochs.update((n) => n + 1);
  }

  /**
   * Replaces a signed-in OPERATOR's Platform assignments with a fresher read of Core's `/auth/grants` (P6-S2b), for the
   * same user in the same session only. Display state: Core still authorizes every request. A set equal to the current
   * one (in any order) changes nothing, so nothing that follows the actor reloads. Never changes the user, the kind or
   * an owner's session, and never signs anyone out.
   *
   * @returns whether the list changed
   */
  refreshGrants(
    epoch: number,
    userId: string,
    platformAssignments: readonly PlatformId[],
  ): boolean {
    const state = this.current();
    if (epoch !== this.epochs() || state.status !== 'signed-in') return false;
    const actor = state.actor;
    if (actor.kind !== 'operator' || actor.userId !== userId) return false;
    const next = [...new Set(platformAssignments)];
    const same =
      next.length === actor.platformAssignments.length &&
      next.every((id) => actor.platformAssignments.includes(id));
    if (same) return false;
    const updated = { ...actor, platformAssignments: next };
    this.current.set({ ...state, actor: updated });
    this.persistDemo(updated);
    return true;
  }

  private restoreDemo(): SessionState {
    if (!isDemo(this.environment)) return { status: 'signed-out' };
    try {
      const value: unknown = JSON.parse(
        globalThis.sessionStorage.getItem('nw.demo.actor') ?? 'null',
      );
      if (value && typeof value === 'object') {
        const actor = value as Record<string, unknown>;
        if (
          typeof actor['userId'] === 'string' &&
          (typeof actor['email'] === 'string' || actor['email'] === null) &&
          ((actor['kind'] === 'owner' && typeof actor['companyId'] === 'string') ||
            (actor['kind'] === 'operator' &&
              Array.isArray(actor['platformAssignments']) &&
              actor['platformAssignments'].every((id: unknown) => typeof id === 'string')))
        ) {
          return { status: 'signed-in', actor: value as Actor, origin: 'demo' };
        }
      }
    } catch {
      /* Invalid or unavailable storage starts signed out. */
    }
    return { status: 'signed-out' };
  }

  private persistDemo(actor: Actor): void {
    try {
      globalThis.sessionStorage.setItem('nw.demo.actor', JSON.stringify(actor));
    } catch {
      /* Keep the session in memory. */
    }
  }

  /** Forgets the session locally. Telling Core (`POST /auth/logout`) is the sign-in flow's job. */
  signOut(): void {
    this.current.set({ status: 'signed-out' });
    try {
      globalThis.sessionStorage.removeItem('nw.demo.actor');
    } catch {
      /* Storage may be unavailable. */
    }
    this.epochs.update((n) => n + 1);
  }
}
