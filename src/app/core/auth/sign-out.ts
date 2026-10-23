import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthGateway } from './auth.gateway';
import { AuthSession } from './auth-session';
import { SIGN_IN_PATH, SIGN_IN_REASON_PARAM, SignInReason } from './return-url';

/**
 * The one sign-out (docs/ARCHITECTURE.md §11), used by the shell's account menu and by the sign-in flow's no-access
 * page: tell Core (best effort), end the local session, then show "You have signed out" on the sign-in page.
 *
 * Provided by each route that binds `AuthGateway` (the shell, the sign-in pages). One run at a time: a second request
 * while one is running is ignored, so a double click never sends two logouts.
 */
@Injectable()
export class SignOut {
  private readonly gateway = inject(AuthGateway);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly running = signal(false);

  /** A sign-out is in progress: the trigger shows it busy. */
  readonly busy = this.running.asReadonly();

  /**
   * @param beforeNavigate clears the caller's own state once the session has ended and before the sign-in page renders
   *   (the sign-in flow drops its email and challenge there).
   */
  async run(beforeNavigate?: () => void): Promise<void> {
    if (this.running()) return;
    this.running.set(true);
    try {
      try {
        await firstValueFrom(this.gateway.logout());
      } catch {
        // The local session ends regardless; Core expires what it could not revoke.
      }
      this.session.signOut();
      beforeNavigate?.();
      const reason: SignInReason = 'signed-out';
      await this.router.navigate([SIGN_IN_PATH], {
        queryParams: { [SIGN_IN_REASON_PARAM]: reason },
      });
    } finally {
      this.running.set(false);
    }
  }
}
