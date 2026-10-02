import { Injectable, computed, inject, signal } from '@angular/core';
import { APP_ENVIRONMENT, isDemo } from '../config/app-environment';
import { Actor } from './actor';

export type SessionState =
  | { readonly status: 'signed-out' }
  | { readonly status: 'signed-in'; readonly actor: Actor; readonly origin: 'demo' };

/**
 * The session boundary (docs/ARCHITECTURE.md §11). A3 delivers the boundary only: Core sign-in (owner password and
 * factor, operator working code) is A4, which adds the `core` origin. Until then the only way to be signed in is the
 * demo owner of a development build, and a production build is always signed out.
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

  /** Signs in the fictional demo owner. Refused unless this build enables demo data. */
  startDemo(actor: Actor): void {
    if (!isDemo(this.environment)) {
      throw new Error('The demo session is not available in this build.');
    }
    this.current.set({ status: 'signed-in', actor, origin: 'demo' });
  }
}
