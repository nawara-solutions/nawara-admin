import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { TotpEnrollment } from '../../../core/auth/auth.model';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { ADAPTER_UNAVAILABLE, AppError, toAppError } from '../../../core/errors/app-error';
import { NW_CLOCK } from '../../../shared/format/clock';
import { AccountSecurityGateway } from '../data-access/account-security.gateway';
import { AccountSecurityFacade } from './account-security.facade';

/**
 * Where adding an authenticator app is (P9-S4b; docs/design/p9-s4-account-security.md §10). Code entry happens in
 * `setup`, `codeRefused` and `notConfirmed`; `busy` phases accept no input.
 */
export type AddAuthenticatorState =
  /** Nothing started, or everything dropped (the page left). */
  | { readonly phase: 'idle' }
  /** Reading the factors: S4b proves the step-up with an authenticator code only, so one must be confirmed. */
  | { readonly phase: 'checking' }
  /** No confirmed authenticator to confirm it's you with (a passkey-only owner): nothing is begun. */
  | { readonly phase: 'noAuthenticator' }
  | { readonly phase: 'beginning' }
  /** Nothing was begun, or nothing usable came back: only a manual "Try again". */
  | { readonly phase: 'beginFailed'; readonly reason: 'rateLimited' | 'unavailable' }
  /** The setup is ready: scan, then enter the NEW app's code. `notice`: why the owner is back here. */
  | { readonly phase: 'setup'; readonly notice: 'unavailable' | null }
  /** The new code's shape is checked here (Core checks the code itself only with the confirmation). */
  | { readonly phase: 'validating' }
  /** Confirming it's the owner with a factor they ALREADY have (step-up `owner.factor.enroll`). */
  | {
      readonly phase: 'verifying';
      readonly busy: boolean;
      readonly problem: 'proofRefused' | 'expired' | 'unavailable' | null;
    }
  /** The confirmation was sent: everything is locked until its answer. */
  | { readonly phase: 'confirming' }
  /**
   * Core definitely refused the new code (`400`) and rolled back: enter another. `grantKept`: the unspent grant is still
   * valid long enough to be reused, so the owner does not confirm it's them again.
   */
  | { readonly phase: 'codeRefused'; readonly grantKept: boolean }
  /** No answer came back: the factor list is read (the confirmation is never resent). */
  | { readonly phase: 'reconciling' }
  /** After a lost answer, the list shows this setup still unconfirmed: enter a code again (and verify again). */
  | { readonly phase: 'notConfirmed' }
  /** This setup no longer exists (a newer setup replaced it, e.g. in another tab): only a new setup can continue. */
  | { readonly phase: 'replaced' }
  /** Too many attempts (`429`): nothing is retried automatically. */
  | { readonly phase: 'rateLimited' }
  /** The answer was lost AND the list could not be read: the outcome is unknown; "Check again" reads it again. */
  | { readonly phase: 'unknown' }
  | { readonly phase: 'succeeded' }
  | { readonly phase: 'cancelled' }
  /** Not the owner (any more), or the session changed or ended: everything was dropped. */
  | { readonly phase: 'refused' }
  /** No adapter in this build: nothing can be begun. */
  | { readonly phase: 'notInBuild' };

export type AddAuthenticatorPhase = AddAuthenticatorState['phase'];

const BUSY: ReadonlySet<AddAuthenticatorPhase> = new Set<AddAuthenticatorPhase>([
  'checking',
  'beginning',
  'validating',
  'confirming',
  'reconciling',
]);

const CODE_ENTRY: ReadonlySet<AddAuthenticatorPhase> = new Set<AddAuthenticatorPhase>([
  'setup',
  'codeRefused',
  'notConfirmed',
]);

/** A TOTP code: six digits, kept as a string (leading zeroes). */
const CODE = /^\d{6}$/;

/**
 * A grant is reused only with more than this left, so it cannot expire between the owner's typing and Core's check
 * (the design's 15 seconds; Core's grants live 300 s by default).
 */
export const GRANT_REUSE_MARGIN_MS = 15_000;

/** The one setup in memory: the factor Core began and its key, shown once. */
interface Setup extends TotpEnrollment {
  readonly ownerId: string;
}

/** A step-up grant held between a definite refusal and the next confirmation: never stored, logged or shown. */
interface HeldGrant {
  readonly token: string;
  readonly ownerId: string;
  readonly expiresAt: number;
}

/**
 * Adding an authenticator app to the signed-in owner's own account (P9-S4b), as one explicit state machine (not
 * `ActionRun`: two commands, begin and confirm, and a grant that survives a definite refusal). Provided by the page, so
 * it lives exactly as long as the page: leaving it disposes everything.
 *
 * Order (owner decision D2): begin → scan → the NEW app's code → confirm it's you with a factor you already have →
 * confirm. Rules:
 * - One request at a time; input is ignored while busy (no double begin, step-up or confirmation).
 * - A confirmation is never resent automatically. A lost answer is reconciled with the factor list: confirmed → done;
 *   unconfirmed → "not added yet" (the grant is dropped: the outcome was unknown); missing → replaced; unreadable →
 *   unknown, with a manual "Check again".
 * - `400 verification_failed` / `validation_error` are definite refusals: Core rolled back, the grant is unspent, and it
 *   is reused only while it has more than `GRANT_REUSE_MARGIN_MS` left, for the same owner. Every other failure drops
 *   it. A `verification_failed` is explained with one list read (wrong code, replaced, or confirmed meanwhile).
 * - `429` stops; nothing is retried automatically.
 * - The setup key, URI, codes and grant live in this object's memory only, and are cleared on success, cancel, a
 *   replaced setup, a session change and when the page is destroyed. No URL, storage, history state, log or toast.
 * - Cancel drops the local setup only: Core has no call to delete an unfinished setup, which stays listed as
 *   "Setup not finished" until a new setup replaces it.
 */
@Injectable()
export class AddAuthenticatorFacade {
  private readonly gateway = inject(AccountSecurityGateway);
  private readonly stepUp = inject(StepUpGateway);
  private readonly session = inject(AuthSession);
  private readonly security = inject(AccountSecurityFacade);
  private readonly now = inject(NW_CLOCK);

  private readonly current = signal<AddAuthenticatorState>({ phase: 'idle' });
  readonly state = this.current.asReadonly();

  private readonly held = signal<Setup | null>(null);
  /** What the page presents: the key and the URI, while a setup is held. */
  readonly setup = computed(() => {
    const setup = this.held();
    return setup === null ? null : { secret: setup.secret, otpauthUri: setup.otpauthUri };
  });

  readonly busy = computed(() => {
    const state = this.current();
    return BUSY.has(state.phase) || (state.phase === 'verifying' && state.busy);
  });
  readonly entersCode = computed(() => CODE_ENTRY.has(this.current().phase));

  /** The signed-in owner allowed to add a factor, or `null` (UX; Core refuses anyone else). */
  private readonly ownerId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'account.factor.add') ? actor.userId : null;
  });

  private newCode: string | null = null;
  private grant: HeldGrant | null = null;
  /** The owner and the session the flow started in: any other session (even the same owner's) ends it. */
  private startedFor: string | null = null;
  private startedIn: number | null = null;
  /** Increments whenever everything is dropped: answers of an earlier run are ignored. */
  private run = 0;
  private readonly destroyed = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed.set(true);
      this.drop({ phase: 'idle' });
    });
    // A sign-out, another identity or a new session: nothing of this flow may survive into it.
    effect(() => {
      const owner = this.ownerId();
      const epoch = this.session.epoch();
      if (this.startedFor !== null && (owner !== this.startedFor || epoch !== this.startedIn))
        this.drop({ phase: 'refused' });
    });
  }

  /** Starts the flow (the page was entered): checks the factors, then begins a setup. Once per run. */
  start(): void {
    if (this.current().phase !== 'idle' || this.destroyed()) return;
    const owner = this.ownerId();
    if (owner === null) return this.current.set({ phase: 'refused' });
    this.startedFor = owner;
    this.startedIn = this.session.epoch();
    this.check();
  }

  /** "Try again" after a begin that failed (manual only). */
  retryBegin(): void {
    if (this.current().phase === 'beginFailed') this.check();
  }

  /** "Start again" after a replaced setup: a new setup, with a new key. */
  restart(): void {
    if (this.current().phase === 'replaced') this.begin();
  }

  /**
   * Submits the NEW app's code. Its shape is checked; then the confirmation is sent at once with a grant that may be
   * reused, otherwise the owner confirms it's them first.
   * @returns `false` when the code is not six digits (nothing happens) or no code can be entered now
   */
  submitCode(code: string): boolean {
    if (!this.entersCode() || this.held() === null) return false;
    const trimmed = code.replace(/\s/g, '');
    if (!CODE.test(trimmed)) return false;
    this.current.set({ phase: 'validating' });
    this.newCode = trimmed;
    if (this.reusableGrant() !== null) this.confirm();
    else {
      this.grant = null;
      this.current.set({ phase: 'verifying', busy: false, problem: null });
    }
    return true;
  }

  /** Confirms it's the owner with a code from an authenticator they ALREADY use, then sends the confirmation. */
  verify(proofCode: string): boolean {
    const state = this.current();
    const owner = this.startedFor;
    if (state.phase !== 'verifying' || state.busy || owner === null) return false;
    const code = proofCode.replace(/\s/g, '');
    if (!CODE.test(code)) return false;
    const run = this.run;
    this.current.set({ phase: 'verifying', busy: true, problem: null });
    this.stepUp.obtain('owner.factor.enroll', { method: 'totp', code }).subscribe({
      next: (grant) => {
        if (run !== this.run) return;
        this.grant = { token: grant.token, ownerId: owner, expiresAt: Date.parse(grant.expiresAt) };
        this.confirm();
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

  /** Back from confirming it's you to the new app's code. */
  back(): void {
    const state = this.current();
    if (state.phase === 'verifying' && !state.busy)
      this.current.set({ phase: 'setup', notice: null });
  }

  /** After a `429`: back to the code, by the owner's own choice (no automatic retry, no countdown: Core gives none). */
  resume(): void {
    if (this.current().phase === 'rateLimited' && this.held() !== null)
      this.current.set({ phase: 'setup', notice: null });
  }

  /** "Check again" after an unknown outcome: reads the factor list again (never resends the confirmation). */
  checkAgain(): void {
    if (this.current().phase === 'unknown') this.reconcile();
  }

  /** Cancel: drops the local setup. Not while a request is in flight. Core's unfinished factor stays (no API). */
  cancel(): boolean {
    if (this.busy()) return false;
    this.drop({ phase: 'cancelled' });
    this.security.announce('cancelled');
    return true;
  }

  private check(): void {
    const run = this.run;
    this.current.set({ phase: 'checking' });
    this.gateway.load().subscribe({
      next: ({ factors }) => {
        if (run !== this.run) return;
        if (factors.some((f) => f.type === 'totp' && f.confirmed)) this.begin();
        else this.current.set({ phase: 'noAuthenticator' });
      },
      error: (thrown: unknown) => this.beginFailed(run, thrown),
    });
  }

  private begin(): void {
    const owner = this.startedFor;
    if (owner === null) return;
    this.forgetSetup();
    const run = this.run;
    this.current.set({ phase: 'beginning' });
    this.gateway.beginTotp().subscribe({
      next: (enrollment) => {
        if (run !== this.run) return;
        this.held.set({ ...enrollment, ownerId: owner });
        this.current.set({ phase: 'setup', notice: null });
      },
      error: (thrown: unknown) => this.beginFailed(run, thrown),
    });
  }

  private beginFailed(run: number, thrown: unknown): void {
    if (run !== this.run) return;
    const error = toAppError(thrown);
    if (this.ended(error)) return;
    this.current.set({
      phase: 'beginFailed',
      reason: error.kind === 'rate_limited' ? 'rateLimited' : 'unavailable',
    });
  }

  private confirm(): void {
    const setup = this.held();
    const code = this.newCode;
    const grant = this.reusableGrant();
    if (setup === null || code === null || grant === null) return;
    const run = this.run;
    this.current.set({ phase: 'confirming' });
    this.send(this.gateway.confirmTotp(setup.factorId, code, grant.token), run, (error) => {
      if (this.ended(error)) return;
      if (error.kind === 'validation') {
        // Definite: Core refused before committing, so the grant was not spent.
        this.newCode = null;
        if (error.code === 'verification_failed') return this.explainRefusal(run, setup.factorId);
        return this.current.set({ phase: 'codeRefused', grantKept: this.reusableGrant() !== null });
      }
      this.grant = null;
      // `step_up_required`: the grant was missing, spent or expired; Core checked no code. Verify again, same code.
      if (error.kind === 'forbidden')
        return this.current.set({ phase: 'verifying', busy: false, problem: 'expired' });
      this.newCode = null;
      switch (error.kind) {
        case 'rate_limited':
          return this.current.set({ phase: 'rateLimited' });
        case 'unavailable':
          // Refused before anything was applied: the code was not checked.
          return this.current.set({ phase: 'setup', notice: 'unavailable' });
        default:
          // Sent, and no answer: it may have been applied. Never resent.
          return this.reconcile();
      }
    });
  }

  /** `verification_failed` is a definite refusal; one list read tells a wrong code from a replaced or confirmed setup. */
  private explainRefusal(run: number, factorId: string): void {
    this.gateway.load().subscribe({
      next: ({ factors }) => {
        if (run !== this.run) return;
        const factor = factors.find((f) => f.id === factorId);
        if (factor === undefined) return this.replaced();
        if (factor.confirmed) return this.succeed();
        this.current.set({ phase: 'codeRefused', grantKept: this.reusableGrant() !== null });
      },
      // Unreadable: still a definite refusal; another code tells the rest.
      error: () => {
        if (run !== this.run) return;
        this.current.set({ phase: 'codeRefused', grantKept: this.reusableGrant() !== null });
      },
    });
  }

  private reconcile(): void {
    const setup = this.held();
    if (setup === null) return;
    const run = this.run;
    this.current.set({ phase: 'reconciling' });
    this.gateway.load().subscribe({
      next: ({ factors }) => {
        if (run !== this.run) return;
        const factor = factors.find((f) => f.id === setup.factorId);
        if (factor === undefined) this.replaced();
        else if (factor.confirmed) this.succeed();
        else this.current.set({ phase: 'notConfirmed' });
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        if (this.ended(toAppError(thrown))) return;
        this.current.set({ phase: 'unknown' });
      },
    });
  }

  private send(command: Observable<void>, run: number, failed: (error: AppError) => void): void {
    command.subscribe({
      next: () => {
        if (run === this.run) this.succeed();
      },
      error: (thrown: unknown) => {
        if (run === this.run) failed(toAppError(thrown));
      },
    });
  }

  private succeed(): void {
    this.drop({ phase: 'succeeded' });
    this.security.announce('added');
  }

  private replaced(): void {
    this.forgetSetup();
    this.current.set({ phase: 'replaced' });
  }

  /**
   * A refusal that ends the flow: no adapter, not the owner (`403` other than a step-up), or no session (`401` outside
   * the step-up). Everything is dropped.
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

  /** The held grant, if it may be sent now: same owner, and enough time left. */
  private reusableGrant(): HeldGrant | null {
    const grant = this.grant;
    if (
      grant === null ||
      grant.ownerId !== this.ownerId() ||
      this.startedIn !== this.session.epoch()
    )
      return null;
    return grant.expiresAt - this.now() > GRANT_REUSE_MARGIN_MS ? grant : null;
  }

  private forgetSetup(): void {
    this.held.set(null);
    this.newCode = null;
    this.grant = null;
  }

  /** Drops every secret and ignores every pending answer. */
  private drop(next: AddAuthenticatorState): void {
    this.run += 1;
    this.forgetSetup();
    this.startedFor = null;
    this.startedIn = null;
    this.current.set(next);
  }
}
