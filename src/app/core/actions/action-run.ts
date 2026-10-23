import { signal } from '@angular/core';
import { Observable } from 'rxjs';
import { FactorProof } from '../auth/auth.model';
import { StepUpGrant } from '../auth/step-up.gateway';
import { toAppError } from '../errors/app-error';
import { ActionFailure, ActionStage, actionFailureOf, retryOf } from './action-failure';

/**
 * Where one administrative action is (docs/ARCHITECTURE.md §12): closed; editing its input; verifying (only an action
 * that requires a step-up), `busy` while the verification is checked; pending (the command was sent); succeeded; failed.
 */
export type ActionPhase<R> =
  | { readonly phase: 'closed' }
  | { readonly phase: 'editing' }
  | { readonly phase: 'verifying'; readonly busy: boolean; readonly failure: ActionFailure | null }
  | { readonly phase: 'pending' }
  | { readonly phase: 'succeeded'; readonly result: R }
  | { readonly phase: 'failed'; readonly failure: ActionFailure };

/** Who acts, in which scope: captured when the action opens and compared again before sending and on the answer. */
export interface ActionContext {
  readonly actorId: string;
  readonly scope: string;
}

export type ActionOutcome<R> =
  | { readonly ok: true; readonly result: R }
  | { readonly ok: false; readonly failure: ActionFailure };

export interface ActionRunOptions<I, R> {
  /** The current actor and scope, or `null` when the action may not run (UX; Core authorizes every request). */
  readonly context: () => ActionContext | null;
  /** Obtains the step-up of the action's purpose; `null` for an action that requires none. */
  readonly stepUp: ((proof: FactorProof) => Observable<StepUpGrant>) | null;
  readonly execute: (
    input: I,
    request: { readonly idempotencyKey: string; readonly stepUpToken: string | null },
  ) => Observable<R>;
  /**
   * The action ended, for the same actor and scope it was opened in. `presented`: its dialog is still open (otherwise
   * the caller reports the result elsewhere, e.g. a toast). Not called for an answer that arrives after an actor change.
   */
  readonly settled?: (outcome: ActionOutcome<R>, input: I, presented: boolean) => void;
  /** One key per logical operation (tests inject a deterministic one). */
  readonly newKey?: () => string;
}

/**
 * The state of ONE administrative action, owned by the facade of the feature it belongs to. Shared orchestration only:
 * the domain rules live in the command and its mock.
 *
 * - One run at a time: input is ignored while a verification is checked or the command is pending.
 * - One idempotency key per logical operation: created for an input, kept across retries of that same input, replaced
 *   when the input changes, dropped once the action ends.
 * - The actor and scope are checked when the action opens, again immediately before anything is sent, and on the
 *   answer: a changed context sends nothing, and a late answer for another actor is dropped silently.
 * - Once sent, a command is never cancelled: closing the dialog (or leaving the page) only detaches it; the answer is
 *   still delivered through `settled` with `presented: false`.
 * - A step-up grant is used for one send and then forgotten; a retry verifies again.
 */
export class ActionRun<I, R> {
  private readonly current = signal<ActionPhase<R>>({ phase: 'closed' });
  readonly state = this.current.asReadonly();

  private captured: ActionContext | null = null;
  private input: I | null = null;
  private fingerprint: string | null = null;
  private key: string | null = null;
  private presented = false;
  /** Increments on every open and close: callbacks of an earlier run are ignored. */
  private run = 0;

  constructor(private readonly options: ActionRunOptions<I, R>) {}

  /** Whether the action is under way (verification checked, or the command sent). */
  get busy(): boolean {
    const state = this.current();
    return state.phase === 'pending' || (state.phase === 'verifying' && state.busy);
  }

  /** Opens the action for the current actor and scope. `false` when it may not run, or one is already under way. */
  open(): boolean {
    if (this.busy) return false;
    const context = this.options.context();
    if (context === null) return false;
    this.run += 1;
    this.captured = context;
    this.input = null;
    this.fingerprint = null;
    this.key = null;
    this.presented = true;
    this.current.set({ phase: 'editing' });
    return true;
  }

  /** Shows a detached command that is still pending again (its dialog reopened): `false` when none is pending. */
  reattach(): boolean {
    if (this.current().phase !== 'pending') return false;
    this.presented = true;
    return true;
  }

  /** Submits the input: verifies first when the action requires a step-up, otherwise sends it. */
  submit(input: I): void {
    const state = this.current();
    if (state.phase !== 'editing' && state.phase !== 'failed') return;
    if (!this.contextHolds()) return this.fail({ kind: 'stale' });
    const fingerprint = JSON.stringify(input);
    if (fingerprint !== this.fingerprint || this.key === null) {
      this.fingerprint = fingerprint;
      this.key = (this.options.newKey ?? (() => crypto.randomUUID()))();
    }
    this.input = input;
    if (this.options.stepUp) this.current.set({ phase: 'verifying', busy: false, failure: null });
    else this.send(null);
  }

  /** Checks the verification, then sends the command with the grant (only while verifying). */
  verify(proof: FactorProof): void {
    const state = this.current();
    const stepUp = this.options.stepUp;
    if (state.phase !== 'verifying' || state.busy || stepUp === null) return;
    if (!this.contextHolds()) return this.fail({ kind: 'stale' });
    const run = this.run;
    this.current.set({ phase: 'verifying', busy: true, failure: null });
    stepUp(proof).subscribe({
      next: (grant) => {
        // Closed meanwhile: the grant is dropped and nothing is sent.
        if (run !== this.run) return;
        this.send(grant.token);
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        const failure = this.failureOf(thrown, 'verify');
        if (failure.kind === 'notInBuild' || failure.kind === 'refused') this.fail(failure);
        else this.current.set({ phase: 'verifying', busy: false, failure });
      },
    });
  }

  /** Back from verifying to the input. */
  back(): void {
    const state = this.current();
    if (state.phase === 'verifying' && !state.busy) this.current.set({ phase: 'editing' });
  }

  /** "Try again" after a failure that allows it: the same request (same key), verified again when required. */
  retry(): void {
    const state = this.current();
    if (state.phase !== 'failed' || this.input === null) return;
    const retry = retryOf(state.failure);
    if (retry === 'edit') this.current.set({ phase: 'editing' });
    else if (retry === 'resend' || retry === 'verify') this.submit(this.input);
  }

  /** Closes the dialog. A sent command keeps running, detached; anything not sent yet is abandoned. */
  close(): void {
    if (this.current().phase === 'pending') {
      this.presented = false;
      return;
    }
    this.run += 1;
    this.reset();
  }

  private send(stepUpToken: string | null): void {
    const input = this.input;
    const key = this.key;
    if (input === null || key === null) return;
    if (!this.contextHolds()) return this.fail({ kind: 'stale' });
    const run = this.run;
    const context = this.captured;
    this.current.set({ phase: 'pending' });
    this.options.execute(input, { idempotencyKey: key, stepUpToken }).subscribe({
      next: (result) => this.settle(run, context, input, { ok: true, result }),
      error: (thrown: unknown) =>
        this.settle(run, context, input, { ok: false, failure: this.failureOf(thrown, 'execute') }),
    });
  }

  private settle(
    run: number,
    context: ActionContext | null,
    input: I,
    outcome: ActionOutcome<R>,
  ): void {
    const now = this.options.context();
    // Another actor, or signed out: nothing of this action may show in their session.
    if (
      context === null ||
      now === null ||
      now.actorId !== context.actorId ||
      now.scope !== context.scope
    ) {
      if (run === this.run) this.reset();
      return;
    }
    const presented = this.presented && run === this.run;
    if (run === this.run) {
      if (outcome.ok) {
        this.key = null;
        this.current.set({ phase: 'succeeded', result: outcome.result });
      } else {
        // The key stays for a retry of the same request; a final refusal ends the operation.
        if (retryOf(outcome.failure) === 'none') this.key = null;
        this.current.set({ phase: 'failed', failure: outcome.failure });
      }
      if (!presented) this.reset();
    }
    this.options.settled?.(outcome, input, presented);
  }

  private fail(failure: ActionFailure): void {
    if (retryOf(failure) === 'none') this.key = null;
    this.current.set({ phase: 'failed', failure });
  }

  private contextHolds(): boolean {
    const now = this.options.context();
    const then = this.captured;
    return (
      now !== null && then !== null && now.actorId === then.actorId && now.scope === then.scope
    );
  }

  private failureOf(thrown: unknown, stage: ActionStage): ActionFailure {
    return actionFailureOf(toAppError(thrown), stage);
  }

  private reset(): void {
    this.captured = null;
    this.input = null;
    this.fingerprint = null;
    this.key = null;
    this.presented = false;
    this.current.set({ phase: 'closed' });
  }
}
