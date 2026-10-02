import { Injectable, computed, inject, signal } from '@angular/core';
import { APP_ENVIRONMENT, isDemo } from '../config/app-environment';
import { Actor } from './actor';

export type SessionState =
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly actor: Actor; readonly origin: 'demo' };

/**
 * The session boundary (docs/ARCHITECTURE.md §11). The sign-in flow (features/auth) establishes it once Core's
 * `/auth/me` and `/auth/grants` have been resolved into an `Actor`, never from the authentication answer alone.
 *
 * A4 first slice: the only `AuthGateway` is the demo mock, so the only session is a DEMO session of a development build.
 * It lives in this signal and in the mock, so a reload ends it. That is a property of the demo only, not Admin's session
 * strategy and not Core's contract: how a real session survives a reload is the open decision D-A4 (CF-01; memory-only
 * is an unapproved proposal, ARCHITECTURE §11). The `core` origin, its tokens and `restore()` / `refresh()` arrive with
 * the HTTP adapter once D-A4 is decided. A production build is always signed out.
 *
 * This is UX state. It is not security: Core authorizes every request from the bearer it receives.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly environment = inject(APP_ENVIRONMENT);
  private readonly current = signal<SessionState>({ status: 'signed-out' });

  readonly state = this.current.asReadonly();
  readonly actor = computed<Actor | null>(() => {
    const state = this.current();
    return state.status === 'signed-in' ? state.actor : null;
  });
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
  }

  /** Forgets the session locally. Telling Core (`POST /auth/logout`) is the sign-in flow's job. */
  signOut(): void {
    this.current.set({ status: 'signed-out' });
  }
}
