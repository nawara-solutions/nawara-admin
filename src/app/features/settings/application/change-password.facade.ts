import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { ADAPTER_UNAVAILABLE, AppError, toAppError } from '../../../core/errors/app-error';
import { AccountSecurityGateway } from '../data-access/account-security.gateway';
import { checkPassword } from '../data-access/password-rules';
import { AccountSecurityFacade } from './account-security.facade';

/** Where changing the password is (P9-S4e; docs/design/p9-s4-account-security.md §13). */
export type ChangePasswordState =
  /** Nothing started, or everything dropped (the page left). */
  | { readonly phase: 'idle' }
  /** Reading the factors: the owner confirms it's them with an authenticator code, so one must be confirmed. */
  | { readonly phase: 'checking' }
  /** No confirmed authenticator (a passkey-only owner): nothing is offered. */
  | { readonly phase: 'noAuthenticator' }
  /** The factors could not be read: only a manual "Try again". Nothing was sent. */
  | { readonly phase: 'loadFailed' }
  /**
   * The new password, twice. `rejected`: Nawara Core refused the last one (`400 validation_error`; nothing changed and
   * the fields were cleared).
   */
  | { readonly phase: 'editing'; readonly rejected: boolean }
  /** Confirming it's the owner with an authenticator code (step-up `owner.password.change`). */
  | {
      readonly phase: 'verifying';
      readonly busy: boolean;
      readonly problem: 'proofRefused' | 'expired' | 'unavailable' | null;
    }
  /** The change was sent: everything is locked until its answer, which is never resent. */
  | { readonly phase: 'changing' }
  /** Too many attempts (`429`): nothing changed and nothing is retried automatically. */
  | { readonly phase: 'rateLimited' }
  /**
   * No usable answer: the previous or the new password may be in force, and nothing can tell (no read exists). The
   * password was dropped; only a completely new attempt can follow.
   */
  | { readonly phase: 'unknown' }
  | { readonly phase: 'done' }
  /** Left before anything was sent: nothing changed. */
  | { readonly phase: 'cancelled' }
  /** Not the owner (any more), or the session changed or ended: everything was dropped. */
  | { readonly phase: 'refused' }
  /** No adapter in this build: nothing can be changed. */
  | { readonly phase: 'notInBuild' };

export type ChangePasswordPhase = ChangePasswordState['phase'];

const BUSY: ReadonlySet<ChangePasswordPhase> = new Set<ChangePasswordPhase>([
  'checking',
  'changing',
]);

/** A TOTP code: six digits, kept as a string (leading zeroes). */
const CODE = /^\d{6}$/;

/**
 * Changing the signed-in owner's own password (P9-S4e), as one explicit state machine, provided by the page so it lives
 * exactly as long as the page. Not `ActionRun`: its "Try again" resends after an unknown outcome, and a password change
 * cannot be read back.
 *
 * Rules:
 * - The new password is checked against Core's documented limits only (`checkPassword`), typed twice, and sent exactly
 *   as typed. Then the owner confirms it's them; each attempt gets a fresh `owner.password.change` grant, used once.
 * - One request at a time; input is ignored while busy; a change is never resent. `204` → done (this session continues;
 *   the others end at their next request). `400 validation_error` → rejected, the fields cleared. `403
 *   step_up_required` → verify again (the password kept for this owner and session only). `401` or another `403` →
 *   refused. `429` → stop. Anything else (no answer, a `5xx`, a `400` without Core's code, an unexpected status) →
 *   unknown: the password is dropped and only "Set your password again" (a completely new attempt) follows. The
 *   session still being signed in proves nothing.
 * - The password lives in this object (and the page's fields) only until the attempt ends; it is dropped on success,
 *   refusal, an unknown outcome, cancel, a session change and the page's destruction. JavaScript strings cannot be
 *   wiped: Admin drops every reference and copies it nowhere else.
 */
@Injectable()
export class ChangePasswordFacade {
  private readonly gateway = inject(AccountSecurityGateway);
  private readonly stepUp = inject(StepUpGateway);
  private readonly session = inject(AuthSession);
  private readonly security = inject(AccountSecurityFacade);

  private readonly current = signal<ChangePasswordState>({ phase: 'idle' });
  readonly state = this.current.asReadonly();
  private readonly cleared = signal(0);
  /** Increments whenever the page must empty its password fields (a refusal, an unknown outcome, a new attempt). */
  readonly clearings = this.cleared.asReadonly();

  readonly busy = computed(() => {
    const state = this.current();
    return BUSY.has(state.phase) || (state.phase === 'verifying' && state.busy);
  });

  /** The signed-in owner allowed to change the password, or `null` (UX; Core refuses anyone else). */
  private readonly ownerId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'account.password.change') ? actor.userId : null;
  });

  /** The password being changed to, only between "Continue" and the attempt's end. */
  private password: string | null = null;
  /** The owner and the session the flow started in: any other session (even the same owner's) ends it. */
  private startedFor: string | null = null;
  private startedIn: number | null = null;
  /** Increments whenever everything is dropped or an attempt ends: answers of an earlier run are ignored. */
  private run = 0;
  private readonly destroyed = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed.set(true);
      this.drop({ phase: 'idle' });
    });
    // A sign-out, another identity or a new session: nothing of this flow may survive into it.
    effect(() => {
      this.ownerId();
      this.session.epoch();
      this.sessionHolds();
    });
  }

  /** Starts the flow (the page was entered): checks the factors. Sends nothing. Once per page. */
  start(): void {
    if (this.current().phase !== 'idle' || this.destroyed()) return;
    const owner = this.ownerId();
    if (owner === null) return this.current.set({ phase: 'refused' });
    this.startedFor = owner;
    this.startedIn = this.session.epoch();
    this.check();
  }

  /** "Try again" after the factors could not be read (manual only). */
  retryCheck(): void {
    if (this.current().phase === 'loadFailed') this.check();
  }

  /**
   * "Continue": the new password, twice. Only when it meets Core's documented limits and both entries are identical
   * (compared exactly, as typed).
   * @returns `false` when not allowed (nothing happens)
   */
  submit(newPassword: string, confirmation: string): boolean {
    if (this.current().phase !== 'editing' || !this.sessionHolds()) return false;
    if (!checkPassword(newPassword).ok || newPassword !== confirmation) return false;
    this.password = newPassword;
    this.current.set({ phase: 'verifying', busy: false, problem: null });
    return true;
  }

  /**
   * Confirms it's the owner with an authenticator code, then sends the change once with that fresh grant.
   * @returns `false` when the code is not six digits (nothing happens) or nothing can be sent now
   */
  verify(proofCode: string): boolean {
    const state = this.current();
    if (state.phase !== 'verifying' || state.busy || !this.sessionHolds()) return false;
    const code = proofCode.replace(/\s/g, '');
    if (!CODE.test(code) || this.password === null) return false;
    const run = this.run;
    this.current.set({ phase: 'verifying', busy: true, problem: null });
    this.stepUp.obtain('owner.password.change', { method: 'totp', code }).subscribe({
      next: (grant) => {
        // Left, or another session meanwhile: the grant is dropped unused.
        if (run !== this.run || !this.sessionHolds()) return;
        this.change(grant.token, run);
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        const error = toAppError(thrown);
        if (this.ended(error)) return;
        switch (error.kind) {
          case 'unauthenticated':
            return this.current.set({ phase: 'verifying', busy: false, problem: 'proofRefused' });
          case 'rate_limited':
            return this.current.set({ phase: 'rateLimited' });
          default:
            return this.current.set({ phase: 'verifying', busy: false, problem: 'unavailable' });
        }
      },
    });
    return true;
  }

  /** Back from the verification to the password (nothing was sent; the page keeps what was typed). */
  back(): void {
    const state = this.current();
    if (state.phase === 'verifying' && !state.busy) {
      this.password = null;
      this.current.set({ phase: 'editing', rejected: false });
    }
  }

  /** After a `429`: back to the verification, by the owner's own choice (no automatic retry). */
  resume(): void {
    if (this.current().phase === 'rateLimited' && this.password !== null && this.sessionHolds())
      this.current.set({ phase: 'verifying', busy: false, problem: null });
  }

  /** "Set your password again" after an unknown outcome: a completely new attempt, empty fields, a new grant later. */
  startOver(): void {
    if (this.current().phase !== 'unknown' || !this.sessionHolds()) return;
    this.run += 1;
    this.cleared.update((n) => n + 1);
    this.current.set({ phase: 'editing', rejected: false });
  }

  /** Cancel (before anything is sent, or after a rate limit): drops the password; Security says nothing changed. */
  cancel(): boolean {
    const state = this.current();
    const cancellable =
      state.phase === 'editing' ||
      state.phase === 'rateLimited' ||
      (state.phase === 'verifying' && !state.busy);
    if (!cancellable) return false;
    this.drop({ phase: 'cancelled' });
    this.security.announce('passwordCancelled');
    return true;
  }

  private check(): void {
    const run = this.run;
    this.current.set({ phase: 'checking' });
    this.gateway.load().subscribe({
      next: ({ factors }) => {
        if (run !== this.run) return;
        if (factors.some((f) => f.type === 'totp' && f.confirmed))
          this.current.set({ phase: 'editing', rejected: false });
        else this.current.set({ phase: 'noAuthenticator' });
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        if (!this.ended(toAppError(thrown))) this.current.set({ phase: 'loadFailed' });
      },
    });
  }

  /** Sends the change ONCE with this grant; the grant is not kept, whatever the answer. */
  private change(token: string, run: number): void {
    const password = this.password;
    if (password === null) return;
    this.current.set({ phase: 'changing' });
    this.gateway.changePassword(password, token).subscribe({
      complete: () => {
        if (run !== this.run) return;
        this.drop({ phase: 'done' });
        this.security.announce('passwordChanged');
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        const error = toAppError(thrown);
        if (error.kind === 'forbidden' && error.code === 'step_up_required')
          // Definite: refused before anything changed (missing, spent or expired grant). Verify again.
          return this.current.set({ phase: 'verifying', busy: false, problem: 'expired' });
        if (error.kind === 'validation' && error.code === 'validation_error') {
          // Core's recognised refusal of the password itself, answered before anything changed.
          this.forgetPassword();
          return this.current.set({ phase: 'editing', rejected: true });
        }
        if (error.kind === 'rate_limited') return this.current.set({ phase: 'rateLimited' });
        if (this.ended(error)) return;
        // No answer, a 5xx, a 400 without Core's code, anything unexpected: it may have changed. Never resent.
        this.run += 1;
        this.forgetPassword();
        this.current.set({ phase: 'unknown' });
      },
    });
  }

  /**
   * A refusal that ends the flow: no adapter (nothing was sent), not the owner (`403` other than a step-up), or no
   * session (`401` outside the verification). Everything is dropped.
   */
  private ended(error: AppError): boolean {
    if (error.kind === 'unavailable' && error.code === ADAPTER_UNAVAILABLE) {
      this.drop({ phase: 'notInBuild' });
      return true;
    }
    const stepUpRefused = error.kind === 'forbidden' && error.code === 'step_up_required';
    const sessionEnded = error.kind === 'unauthenticated' && this.current().phase !== 'verifying';
    if ((error.kind === 'forbidden' && !stepUpRefused) || sessionEnded) {
      this.drop({ phase: 'refused' });
      return true;
    }
    return false;
  }

  /** Whether the flow's owner and session are still the current ones; drops everything when not. */
  private sessionHolds(): boolean {
    if (this.startedFor === null) return true;
    if (this.ownerId() === this.startedFor && this.session.epoch() === this.startedIn) return true;
    this.drop({ phase: 'refused' });
    return false;
  }

  private forgetPassword(): void {
    this.password = null;
    this.cleared.update((n) => n + 1);
  }

  /** Drops the password and ignores every pending answer. */
  private drop(next: ChangePasswordState): void {
    this.run += 1;
    this.forgetPassword();
    this.startedFor = null;
    this.startedIn = null;
    this.current.set(next);
  }
}
