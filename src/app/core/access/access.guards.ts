import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSession } from '../auth/auth-session';
import { RETURN_URL_PARAM, SIGN_IN_PATH, safeReturnUrl } from '../auth/return-url';
import { APP_ENVIRONMENT, isDemo } from '../config/app-environment';
import { Capability, can } from './capability-policy';

/** Navigation targets of the guards (app.routes.ts). */
export const SESSION_UNAVAILABLE_PATH = '/session-unavailable';
export const FORBIDDEN_PATH = '/forbidden';

/**
 * Whether this build can sign anyone in. Only the demo mock adapter exists in this A4 slice; a production build has no
 * sign-in until the HTTP adapter lands, and says so instead of showing a form that cannot work.
 */
const signInAvailable = () => isDemo(inject(APP_ENVIRONMENT));

/**
 * A session exists. Without one the user is sent to sign in, keeping the requested page as a safe return URL; in a
 * build without sign-in, to the "sign-in not available" page. Guards are navigation controls, never security
 * (docs/ARCHITECTURE.md §6).
 */
export const sessionGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthSession).actor() !== null) return true;
  const router = inject(Router);
  if (!signInAvailable()) return router.parseUrl(SESSION_UNAVAILABLE_PATH);
  const returnUrl = safeReturnUrl(state.url);
  return router.createUrlTree(
    [SIGN_IN_PATH],
    returnUrl === null ? {} : { queryParams: { [RETURN_URL_PARAM]: returnUrl } },
  );
};

/** The sign-in pages are for visitors: a signed-in actor goes to the application. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (!signInAvailable()) return router.parseUrl(SESSION_UNAVAILABLE_PATH);
  return inject(AuthSession).actor() === null ? true : router.parseUrl('/');
};

/** The actor has a UX capability; otherwise the shell's "not available to you" page (UX only, §10). */
export const capabilityGuard =
  (capability: Capability): CanActivateFn =>
  () => {
    if (can(inject(AuthSession).actor(), capability)) return true;
    return inject(Router).parseUrl(FORBIDDEN_PATH);
  };
