import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { ADAPTER_UNAVAILABLE, AppError, toAppError } from '../../../core/errors/app-error';
import { AccountSecurityGateway, SecurityFactor } from '../data-access/account-security.gateway';
import { AccountSecurityFacade } from './account-security.facade';
import { RemovalBlock, factorNumbers, removalBlock } from './factor-removal';

/** The factor being removed, as the fresh list showed it: its facts, its position, and how many confirmed would remain. */
export interface RemovalTarget {
  readonly factor: SecurityFactor;
  readonly number: number | null;
  readonly remaining: number;
}

/**
 * Where removing a factor is (P9-S4d; docs/design/p9-s4-account-security.md §12). `closed` is the only state without a
 * dialog. `refreshing` and a busy `verifying` accept no input but may still be cancelled (nothing was sent);
 * `removing` and `reconciling` cannot be dismissed.
 */
export type RemoveFactorState =
  | { readonly phase: 'closed' }
  /** The factor list is read again before anything is offered. */
  | { readonly phase: 'refreshing' }
  /** The fresh read failed: nothing was sent; only a manual "Try again". */
  | { readonly phase: 'refreshFailed' }
  /** Not removable from Admin (Core's rule, or Admin's own), or an unfinished setup: nothing is offered. */
  | { readonly phase: 'blocked'; readonly reason: RemovalBlock | 'unfinished' }
  /** The destructive confirmation: what will be removed and what it means. */
  | { readonly phase: 'confirming'; readonly target: RemovalTarget }
  /** Confirming it's the owner with an authenticator code (step-up `owner.factor.remove`). */
  | {
      readonly phase: 'verifying';
      readonly target: RemovalTarget;
      readonly busy: boolean;
      readonly problem: 'proofRefused' | 'expired' | 'unavailable' | null;
    }
  /** The removal was sent: locked until its answer, which is never resent. */
  | { readonly phase: 'removing'; readonly target: RemovalTarget }
  /** No usable answer came back: the factor list decides (read only). */
  | { readonly phase: 'reconciling'; readonly target: RemovalTarget }
  /** Core kept it: the last confirmed factor (`409 factor_required`). Nothing changed. */
  | { readonly phase: 'lastFactor'; readonly target: RemovalTarget }
  /** After an unclear answer the factor is still there: nothing changed; a new attempt starts again. */
  | { readonly phase: 'stillPresent'; readonly target: RemovalTarget }
  /** After an unclear answer the list could not be read: unknown; "Check again" reads it only. */
  | { readonly phase: 'unknown'; readonly target: RemovalTarget }
  /** Too many attempts (`429`): nothing is retried automatically. */
  | { readonly phase: 'rateLimited'; readonly target: RemovalTarget }
  /** Not the owner (any more), or the session changed or ended: everything was dropped. */
  | { readonly phase: 'refused' }
  /** No adapter in this build: nothing can be removed. */
  | { readonly phase: 'notInBuild' };

export type RemoveFactorPhase = RemoveFactorState['phase'];

/**
 * What the Security page says once the dialog has closed: `removed` (Core answered `204`) or `absent` (the factor is no
 * longer there, `404` or a fresh read; never attributed to this request).
 */
export type RemoveFactorOutcome = 'removed' | 'absent';

/** The removal was sent and its answer is not settled: the dialog cannot be dismissed. */
const LOCKED: ReadonlySet<RemoveFactorPhase> = new Set<RemoveFactorPhase>([
  'removing',
  'reconciling',
]);

/** A TOTP code: six digits, kept as a string (leading zeroes). */
const CODE = /^\d{6}$/;

/**
 * Removing one of the signed-in owner's own confirmed factors (P9-S4d), as one explicit state machine, provided by the
 * Security page so it lives exactly as long as the page. Not `ActionRun`: its "Try again" resends after an unknown
 * outcome, and a lost removal must be settled by the factor list instead.
 *
 * Rules:
 * - Opening reads the factor list again; only a confirmed factor that Admin may remove (`removalBlock`) is offered.
 * - One removal at a time, after the destructive confirmation and a fresh `owner.factor.remove` grant, used once and
 *   never kept: a new attempt verifies again, whatever ended the previous one (`404` and `409` included).
 * - `204` → removed; `404` → absent (not attributed to this request); `409 factor_required` → the last factor;
 *   `403 step_up_required` → verify again; `401` or another `403` → refused; `429` → stop. Anything else is read back:
 *   gone → absent; still there → still present (a new attempt starts over); unreadable → unknown with a read-only
 *   "Check again". A DELETE is never resent automatically.
 * - The code and the grant are dropped on close, on a session change (sign-out, another identity, a new session of the
 *   same owner) and when the page is destroyed; late answers are ignored.
 */
@Injectable()
export class RemoveFactorFacade {
  private readonly gateway = inject(AccountSecurityGateway);
  private readonly stepUp = inject(StepUpGateway);
  private readonly session = inject(AuthSession);
  private readonly security = inject(AccountSecurityFacade);

  private readonly current = signal<RemoveFactorState>({ phase: 'closed' });
  readonly state = this.current.asReadonly();
  private readonly lastOutcome = signal<RemoveFactorOutcome | null>(null);
  /** The last removal's end, for the Security page (cleared when another one opens). */
  readonly outcome = this.lastOutcome.asReadonly();

  /** The removal is in flight (or being settled): no dismissal, no input. */
  readonly locked = computed(() => LOCKED.has(this.current().phase));
  /** No input is accepted (a read, a verification or the removal is under way). */
  readonly busy = computed(() => {
    const state = this.current();
    return (
      this.locked() || state.phase === 'refreshing' || (state.phase === 'verifying' && state.busy)
    );
  });

  /** The signed-in owner allowed to remove a factor, or `null` (UX; Core refuses anyone else). */
  private readonly ownerId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'account.factor.remove') ? actor.userId : null;
  });

  private targetId: string | null = null;
  /** The owner and the session the removal started in: any other session (even the same owner's) ends it. */
  private startedFor: string | null = null;
  private startedIn: number | null = null;
  /** Increments whenever everything is dropped or a removal (re)starts: answers of an earlier run are ignored. */
  private run = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.drop({ phase: 'closed' }));
    // A sign-out, another identity or a new session: nothing of this removal may survive into it.
    effect(() => {
      this.ownerId();
      this.session.epoch();
      this.sessionHolds();
    });
  }

  /**
   * Opens the removal of `factorId`: the factor list is read again first.
   * @returns `false` when one is already open (nothing happens)
   */
  open(factorId: string): boolean {
    if (this.current().phase !== 'closed') return false;
    this.lastOutcome.set(null);
    const owner = this.ownerId();
    if (owner === null) {
      this.current.set({ phase: 'refused' });
      return true;
    }
    this.targetId = factorId;
    this.startedFor = owner;
    this.startedIn = this.session.epoch();
    this.refresh();
    return true;
  }

  /** "Try again" after a failed read, or a new attempt after the factor was still there: from a fresh read again. */
  retry(): void {
    const phase = this.current().phase;
    if ((phase === 'refreshFailed' || phase === 'stillPresent') && this.sessionHolds())
      this.refresh();
  }

  /** "Continue to remove": to the verification. */
  proceed(): void {
    const state = this.current();
    if (state.phase === 'confirming' && this.sessionHolds())
      this.current.set({ phase: 'verifying', target: state.target, busy: false, problem: null });
  }

  /**
   * Confirms it's the owner with an authenticator code (any confirmed one, the factor being removed included: Core
   * does not say which proved it), then sends the removal once with that grant.
   * @returns `false` when the code is not six digits (nothing happens) or nothing can be sent now
   */
  verify(proofCode: string): boolean {
    const state = this.current();
    if (state.phase !== 'verifying' || state.busy || !this.sessionHolds()) return false;
    const code = proofCode.replace(/\s/g, '');
    if (!CODE.test(code)) return false;
    const target = state.target;
    const run = this.run;
    this.current.set({ phase: 'verifying', target, busy: true, problem: null });
    this.stepUp.obtain('owner.factor.remove', { method: 'totp', code }).subscribe({
      next: (grant) => {
        // Closed, or another session meanwhile: the grant is dropped unused.
        if (run !== this.run || !this.sessionHolds()) return;
        this.remove(target, grant.token, run);
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        const error = toAppError(thrown);
        if (this.ended(error)) return;
        switch (error.kind) {
          case 'unauthenticated':
            return this.current.set({
              phase: 'verifying',
              target,
              busy: false,
              problem: 'proofRefused',
            });
          case 'rate_limited':
            return this.current.set({ phase: 'rateLimited', target });
          default:
            return this.current.set({
              phase: 'verifying',
              target,
              busy: false,
              problem: 'unavailable',
            });
        }
      },
    });
    return true;
  }

  /** Back from the verification to the confirmation (nothing was sent). */
  back(): void {
    const state = this.current();
    if (state.phase === 'verifying' && !state.busy)
      this.current.set({ phase: 'confirming', target: state.target });
  }

  /** After a `429`: back to the verification, by the owner's own choice (no automatic retry). */
  resume(): void {
    const state = this.current();
    if (state.phase === 'rateLimited' && this.sessionHolds())
      this.current.set({ phase: 'verifying', target: state.target, busy: false, problem: null });
  }

  /** "Check again" after an unknown outcome: reads the factor list again (never resends the removal). */
  checkAgain(): void {
    const state = this.current();
    if (state.phase === 'unknown' && this.sessionHolds()) this.reconcile(state.target);
  }

  /**
   * Closes the dialog (Cancel, Escape, Close): drops the code, any grant on its way and anything pending. Not once the
   * removal was sent and is unsettled.
   * @returns `false` while locked
   */
  close(): boolean {
    if (this.locked()) return false;
    if (this.current().phase !== 'closed') this.drop({ phase: 'closed' });
    return true;
  }

  private refresh(): void {
    const factorId = this.targetId;
    if (factorId === null) return;
    this.run += 1;
    const run = this.run;
    this.current.set({ phase: 'refreshing' });
    this.gateway.load().subscribe({
      next: ({ factors }) => {
        if (run !== this.run) return;
        const factor = factors.find((f) => f.id === factorId);
        if (factor === undefined) return this.finish('absent');
        if (!factor.confirmed) return this.current.set({ phase: 'blocked', reason: 'unfinished' });
        const reason = removalBlock(factors, factor);
        if (reason !== null) return this.current.set({ phase: 'blocked', reason });
        const remaining = factors.filter((f) => f.confirmed).length - 1;
        const number = factorNumbers(factors).get(factor.id) ?? null;
        this.current.set({ phase: 'confirming', target: { factor, number, remaining } });
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        if (!this.ended(toAppError(thrown))) this.current.set({ phase: 'refreshFailed' });
      },
    });
  }

  /** Sends the removal ONCE with this grant; the grant is not kept, whatever the answer. */
  private remove(target: RemovalTarget, token: string, run: number): void {
    this.current.set({ phase: 'removing', target });
    this.gateway.removeFactor(target.factor.id, token).subscribe({
      complete: () => {
        if (run === this.run) this.finish('removed');
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        const error = toAppError(thrown);
        if (error.kind === 'forbidden' && error.code === 'step_up_required')
          // Definite: refused before anything changed (missing, spent or expired grant). Verify again.
          return this.current.set({ phase: 'verifying', target, busy: false, problem: 'expired' });
        if (error.kind === 'not_found') return this.finish('absent');
        if (error.kind === 'conflict' && error.code === 'factor_required') {
          this.security.reload();
          return this.current.set({ phase: 'lastFactor', target });
        }
        if (error.kind === 'rate_limited')
          return this.current.set({ phase: 'rateLimited', target });
        if (this.ended(error)) return;
        // No answer, a network error, any 5xx or anything unexpected: the list decides. Never resent.
        this.reconcile(target);
      },
    });
  }

  private reconcile(target: RemovalTarget): void {
    const run = this.run;
    this.current.set({ phase: 'reconciling', target });
    this.gateway.load().subscribe({
      next: ({ factors }) => {
        if (run !== this.run) return;
        if (!factors.some((f) => f.id === target.factor.id)) return this.finish('absent');
        this.security.reload();
        this.current.set({ phase: 'stillPresent', target });
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        if (!this.ended(toAppError(thrown))) this.current.set({ phase: 'unknown', target });
      },
    });
  }

  /** The removal ended with the factor gone: the dialog closes, the list reloads, the page says what happened. */
  private finish(outcome: RemoveFactorOutcome): void {
    this.drop({ phase: 'closed' });
    this.lastOutcome.set(outcome);
    this.security.reload();
  }

  /**
   * A refusal that ends the removal: no adapter (nothing was sent), not the owner (`403` other than a step-up), or no
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

  /** Whether the removal's owner and session are still the current ones; drops everything when not. */
  private sessionHolds(): boolean {
    if (this.startedFor === null) return true;
    if (this.ownerId() === this.startedFor && this.session.epoch() === this.startedIn) return true;
    this.drop({ phase: 'refused' });
    return false;
  }

  /** Drops the target and ignores every pending answer. */
  private drop(next: RemoveFactorState): void {
    this.run += 1;
    this.targetId = null;
    this.startedFor = null;
    this.startedIn = null;
    this.current.set(next);
  }
}
