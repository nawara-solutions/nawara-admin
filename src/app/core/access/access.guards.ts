import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { Capability, can } from './capability-policy';

/** Navigation targets of the guards (app.routes.ts). */
export const SESSION_UNAVAILABLE_PATH = '/session-unavailable';
export const FORBIDDEN_PATH = '/forbidden';

/**
 * A session exists. Without one (every production build until A4) the user is sent to the "sign-in not available" page.
 * Guards are navigation controls, never security (docs/ARCHITECTURE.md §6).
 */
export const sessionGuard: CanActivateFn = () => {
  if (inject(AuthSession).actor() !== null) return true;
  return inject(Router).parseUrl(SESSION_UNAVAILABLE_PATH);
};

/** The actor has a UX capability; otherwise the shell's "not available to you" page (UX only, §10). */
export const capabilityGuard =
  (capability: Capability): CanActivateFn =>
  () => {
    if (can(inject(AuthSession).actor(), capability)) return true;
    return inject(Router).parseUrl(FORBIDDEN_PATH);
  };
