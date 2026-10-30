import { computed, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { ActionFailure, actionFailureOf } from '../actions/action-failure';
import { FactorProof } from '../auth/auth.model';
import { toAppError } from '../errors/app-error';
import { RECEIPT_OPERATION_PURPOSE, ReceiptOperation } from './purpose-registry';
import {
  FinancialCommandFailure,
  RECEIPT_CONSUMERS,
  ReceiptIssueFailure,
  financialCommandFailureOf,
  receiptIssueFailureOf,
  resubmissionPolicy,
} from './receipt-failure';
import { AuthorizationReceiptGateway } from './receipt.gateway';
import { ReceiptHolderScope } from './receipt-holder-scope';
import { IssuedReceipt, ReceiptIssueRequest } from './receipt.model';
import { ReceiptStepUpGateway } from './receipt-step-up.gateway';
import { UncertainFinancialTargets } from './uncertain-financial-targets';

/**
 * Who runs a financial intent, in which session and scope: captured when it opens, compared again before every send and on every
 * answer. A change (sign-out, another account, another session, another scope) ends the intent and discards its secret.
 */
export interface FinancialRunContext {
  readonly actorId: string;
  readonly sessionKey: string;
  readonly scope: string;
}

/**
 * Why the authorization side ended without a consumed receipt:
 * - `cancelled` (the person, or the page went away), `contextChanged`, `revoked` (`401`/`403` from Core);
 * - `expired` (the receipt's `expiresAt` passed before it was submitted), `voided` (Core voided it after a lost answer);
 * - `issueRefused` (a definitive issuance refusal), `notInBuild` (no adapter);
 * - `spent` (the consumer answered definitively without applying: the receipt cannot be used again);
 * - `outcomeUncertain` (no answer on a route without `Idempotency-Key`: nothing may be resent, CF-74).
 */
export type AuthorizationEnd =
  | 'outcomeUncertain'
  | 'cancelled'
  | 'contextChanged'
  | 'revoked'
  | 'expired'
  | 'voided'
  | 'issueRefused'
  | 'notInBuild'
  | 'spent';

/** The AUTHORIZATION machine (receipt): never says anything about the financial effect. */
export type ReceiptAuthorizationState =
  | { readonly step: 'closed' }
  /** The target's last no-key command is uncertain: no new intent until CF-74 (or a read proving it applied). */
  | { readonly step: 'blocked' }
  | { readonly step: 'awaitingFactor'; readonly failure: ActionFailure | null }
  | { readonly step: 'verifying' }
  | { readonly step: 'issuing' }
  /** No usable issuance answer: the SAME request (same key, same step-up) may be replayed once. */
  | { readonly step: 'issueUnknown'; readonly replayed: boolean }
  | {
      readonly step: 'issued';
      readonly receiptId: string;
      readonly expiresAt: string;
      readonly simulated: boolean;
    }
  | { readonly step: 'consumed'; readonly receiptId: string }
  | {
      readonly step: 'ended';
      readonly reason: AuthorizationEnd;
      readonly issueFailure: ReceiptIssueFailure | null;
    };

/** The FINANCIAL OUTCOME machine (consumer), separate from the authorization. */
export type FinancialOutcomeState<R> =
  /** `lastFailure`: Core stated nothing changed; the same request may be sent again while the receipt is unexpired. */
  | { readonly status: 'notSubmitted'; readonly lastFailure: FinancialCommandFailure | null }
  | { readonly status: 'submitted' }
  | { readonly status: 'applied'; readonly result: R; readonly via: 'answer' | 'reconciliation' }
  | { readonly status: 'refused'; readonly failure: FinancialCommandFailure }
  /** Core documents "repeat the same request" for this answer: same receipt, same key. */
  | { readonly status: 'unresolved'; readonly failure: FinancialCommandFailure }
  /**
   * No answer. `sameKeyReplay`: the route takes `Idempotency-Key`, so an identical repeat replays Core's outcome.
   * `blockedUntilCF74`: the route takes none: nothing may be resent; reads are information only.
   */
  | { readonly status: 'outcomeUnknown'; readonly policy: 'sameKeyReplay' | 'blockedUntilCF74' };

/** An explicitly supported read of the consumer's resource: it proves the command applied, or says nothing more. */
export type ReconciliationAnswer<R> =
  { readonly applied: true; readonly result: R } | { readonly applied: false };

export interface FinancialAuthorizationRunOptions<O extends ReceiptOperation, R> {
  readonly operation: O;
  /** The current actor, session and scope, or `null` when signed out. */
  readonly context: () => FinancialRunContext | null;
  readonly stepUp: ReceiptStepUpGateway;
  readonly receipts: AuthorizationReceiptGateway;
  /** The consumer command (a fake in F1-S5). It receives the secret holder, never a value, and the consumer key. */
  readonly submit: (
    receipt: IssuedReceipt<O>,
    request: { readonly idempotencyKey: string },
  ) => Observable<R>;
  /** The consumer's supported read, if any (a fake in F1-S5). Absent: nothing can be reconciled. */
  readonly reconcile?: (
    binding: IssuedReceipt<O>['binding'],
  ) => Observable<ReconciliationAnswer<R>>;
  readonly uncertain: UncertainFinancialTargets;
  /** Core's clock as Admin sees it (`NW_CLOCK`). Expiry uses Core's `expiresAt`; the local clock is advisory. */
  readonly now: () => number;
  /** Two distinct keys per intent (tests inject deterministic ones). */
  readonly newKey?: () => string;
}

const NOT_SUBMITTED = { status: 'notSubmitted', lastFailure: null } as const;

/**
 * ONE financial intent that needs an authorization receipt (F1-S5; docs/design/f1-financial-authorization.md §7.2). Headless:
 * owned by a later feature facade; a sibling of `ActionRun`, which it does not change.
 *
 * Rules (§7.2):
 * 1. Authorization and outcome are separate: `issued` is never "done"; only an `applied` answer or a proving read is.
 * 2. Nothing goes back from `outcomeUnknown` or `unresolved` to a new receipt for the same intent. A no-key route with an
 *    uncertain outcome blocks its target (`UncertainFinancialTargets`) until CF-74.
 * 3. The secret is held, in memory, from `issued` to a terminal state, so Core's identical repeat stays possible; it is
 *    discarded on applied, refused, expiry, cancellation, a context change and when the outcome is blocked.
 * 4. Single flight: input is ignored while verifying, issuing, submitted or reconciling.
 * 5. Two keys per intent, fixed: `Ki` (issuance) and `Kc` (consumer). A new intent has new keys.
 * 6. Expiry from Core's `expiresAt`: an expired, unsubmitted receipt is discarded and never sent.
 * Nothing is ever resent automatically: every repeat is the person's explicit action.
 */
export class FinancialAuthorizationRun<O extends ReceiptOperation, R> {
  private readonly authorizationState = signal<ReceiptAuthorizationState>({ step: 'closed' });
  private readonly outcomeState = signal<FinancialOutcomeState<R>>(NOT_SUBMITTED);
  private readonly reconciling = signal(false);
  readonly authorization = this.authorizationState.asReadonly();
  readonly outcome = this.outcomeState.asReadonly();

  /** Whether a request of this intent is in flight (input is ignored meanwhile). */
  readonly busy = computed(() => {
    const step = this.authorizationState().step;
    return (
      step === 'verifying' ||
      step === 'issuing' ||
      this.outcomeState().status === 'submitted' ||
      this.reconciling()
    );
  });

  private captured: FinancialRunContext | null = null;
  private binding: ReceiptIssueRequest<O>['binding'] | null = null;
  private issuanceKey: string | null = null;
  private consumerKey: string | null = null;
  private stepUpProof: ReceiptIssueRequest<O>['stepUp'] | null = null;
  private receipt: IssuedReceipt<O> | null = null;
  private holder: ReceiptHolderScope | null = null;
  /** Increments whenever the intent ends: answers of an earlier intent are dropped. */
  private run = 0;

  constructor(private readonly options: FinancialAuthorizationRunOptions<O, R>) {}

  private get noKeyRoute(): boolean {
    return !RECEIPT_CONSUMERS[this.options.operation].idempotencyKey;
  }

  /**
   * Opens an intent for a binding the caller has just read from Core (frozen here). `false` when signed out, while another
   * intent is under way, or when the target is blocked by an uncertain outcome (the state then says `blocked`).
   */
  open(binding: ReceiptIssueRequest<O>['binding']): boolean {
    if (this.busy() || this.active()) return false;
    const context = this.options.context();
    if (context === null) return false;
    this.run += 1;
    this.forget();
    this.outcomeState.set(NOT_SUBMITTED);
    if (this.options.uncertain.isBlocked(binding)) {
      this.authorizationState.set({ step: 'blocked' });
      return false;
    }
    const newKey = this.options.newKey ?? (() => crypto.randomUUID());
    this.captured = context;
    // A private copy: a later change to the caller's object cannot change what is authorized.
    this.binding = structuredClone(binding);
    this.issuanceKey = newKey();
    this.consumerKey = newKey();
    this.holder = new ReceiptHolderScope(context.sessionKey);
    this.authorizationState.set({ step: 'awaitingFactor', failure: null });
    return true;
  }

  /** Proves the receipt purpose's factor (factor only), then asks for the receipt with it. */
  verify(proof: FactorProof): void {
    if (this.authorizationState().step !== 'awaitingFactor' || this.busy()) return;
    if (!this.contextHolds()) return this.end('contextChanged');
    const run = this.run;
    const purpose = RECEIPT_OPERATION_PURPOSE[this.options.operation];
    this.authorizationState.set({ step: 'verifying' });
    this.options.stepUp.obtain(purpose, proof).subscribe({
      next: (stepUp) => {
        if (!this.current(run)) return;
        this.stepUpProof = stepUp;
        this.issue(run);
      },
      error: (thrown: unknown) => {
        if (!this.current(run)) return;
        const failure = actionFailureOf(toAppError(thrown), 'verify');
        if (failure.kind === 'notInBuild') this.end('notInBuild');
        else if (failure.kind === 'refused') this.end('revoked');
        else this.authorizationState.set({ step: 'awaitingFactor', failure });
      },
    });
  }

  /** After an issuance answer was lost: the SAME request once more (same key, same step-up). Never a new receipt. */
  replayIssue(): void {
    const state = this.authorizationState();
    if (state.step !== 'issueUnknown' || state.replayed || this.busy()) return;
    if (!this.contextHolds()) return this.end('contextChanged');
    this.issue(this.run, true);
  }

  /** Sends the consumer command with the held receipt (only before any submission, or after "nothing changed"). */
  submit(): void {
    if (this.authorizationState().step !== 'issued' || this.busy()) return;
    if (this.outcomeState().status !== 'notSubmitted') return;
    if (this.expired()) return this.end('expired');
    this.send();
  }

  /** The identical request again, where Core sanctions it: an `unresolved` answer, or no answer on a route with a key. */
  repeatIdentical(): void {
    if (!this.canRepeatIdentical() || this.busy()) return;
    this.send();
  }

  /** Whether `repeatIdentical` is possible now (never on a no-key route after an uncertain outcome). */
  canRepeatIdentical(): boolean {
    const outcome = this.outcomeState();
    const allowed =
      outcome.status === 'unresolved' ||
      (outcome.status === 'outcomeUnknown' && outcome.policy === 'sameKeyReplay');
    return allowed && this.receipt !== null && this.receipt.secret.held;
  }

  /**
   * Re-reads the consumer's resource after an uncertain outcome. A read proving the command applied settles the intent (and lifts
   * a block); any other answer changes nothing: it never authorizes a resubmission.
   */
  reconcile(): void {
    const reconcile = this.options.reconcile;
    const status = this.outcomeState().status;
    const binding = this.binding;
    if (reconcile === undefined || binding === null || this.busy()) return;
    if (status !== 'unresolved' && status !== 'outcomeUnknown') return;
    if (!this.contextHolds()) return this.checkContext();
    const run = this.run;
    this.reconciling.set(true);
    reconcile(binding).subscribe({
      next: (answer) => {
        if (run !== this.run) return;
        this.reconciling.set(false);
        if (!this.contextHolds()) return this.checkContext();
        if (answer.applied) this.applied(answer.result, 'reconciliation');
      },
      error: () => {
        if (run === this.run) this.reconciling.set(false);
      },
    });
  }

  /** Called by a timer or before showing the receipt: discards an unsubmitted receipt whose `expiresAt` has passed. */
  checkExpiry(): void {
    if (
      this.authorizationState().step === 'issued' &&
      this.outcomeState().status === 'notSubmitted' &&
      this.expired()
    )
      this.end('expired');
  }

  /** Called when the session or scope may have changed (sign-out, account switch, navigation to another scope). */
  checkContext(): void {
    if (this.active() && !this.contextHolds()) this.end('contextChanged');
  }

  /** The person cancels, or the page is destroyed: the intent ends and its secret is discarded. A sent command is not recalled. */
  cancel(): void {
    if (this.active()) this.end('cancelled');
  }

  private issue(run: number, replay = false): void {
    const binding = this.binding;
    const stepUp = this.stepUpProof;
    const idempotencyKey = this.issuanceKey;
    if (binding === null || stepUp === null || idempotencyKey === null) return;
    if (!this.contextHolds()) return this.end('contextChanged');
    this.authorizationState.set({ step: 'issuing' });
    // Each part is typed by `O` (binding and step-up purpose belong to the same operation), but TypeScript cannot resolve the
    // distributive `ReceiptIssueRequest<O>` while `O` is generic; the gateway still type-checks every concrete operation.
    const request = { binding, stepUp, idempotencyKey } as ReceiptIssueRequest<O>;
    this.options.receipts.issue(request).subscribe({
      next: (receipt) => {
        if (!this.current(run)) {
          // The intent ended meanwhile: this secret is never held.
          receipt.secret.discard();
          return;
        }
        this.stepUpProof = null;
        this.receipt = receipt;
        this.holder?.track(receipt.secret);
        this.authorizationState.set({
          step: 'issued',
          receiptId: receipt.receiptId,
          expiresAt: receipt.expiresAt,
          simulated: receipt.simulated === true,
        });
        this.checkExpiry();
      },
      error: (thrown: unknown) => {
        if (!this.current(run)) return;
        this.issueFailed(receiptIssueFailureOf(toAppError(thrown)), replay);
      },
    });
  }

  private issueFailed(failure: ReceiptIssueFailure, replay: boolean): void {
    switch (failure.kind) {
      case 'outcomeUnknown':
        // Only ONE replay of the same request: a second loss ends the intent (a new one starts afresh).
        if (replay) return this.end('issueRefused', failure);
        this.authorizationState.set({ step: 'issueUnknown', replayed: false });
        return;
      case 'stepUpRefused':
      case 'unavailableNoMutation':
        // Nothing was issued: prove the factor again (same issuance key; the request hash covers the binding only).
        this.stepUpProof = null;
        this.authorizationState.set({ step: 'awaitingFactor', failure: null });
        return;
      case 'voided':
        return this.end('voided', failure);
      case 'expired':
        return this.end('expired', failure);
      case 'sessionOrAuthorityRevoked':
        return this.end('revoked', failure);
      case 'contractUnavailable':
        return this.end('notInBuild', failure);
      case 'bindingInvalid':
      case 'requestInvalid':
      case 'alreadyConsumed':
      case 'idempotencyConflict':
        return this.end('issueRefused', failure);
    }
  }

  private send(): void {
    const receipt = this.receipt;
    const idempotencyKey = this.consumerKey;
    if (receipt === null || idempotencyKey === null || !receipt.secret.held) return;
    if (!this.contextHolds()) return this.end('contextChanged');
    const run = this.run;
    this.outcomeState.set({ status: 'submitted' });
    this.options.submit(receipt, { idempotencyKey }).subscribe({
      next: (result) => {
        if (run !== this.run) return;
        if (!this.contextHolds()) return this.end('contextChanged');
        this.applied(result, 'answer');
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        if (!this.contextHolds()) return this.end('contextChanged');
        this.commandFailed(financialCommandFailureOf(this.options.operation, toAppError(thrown)));
      },
    });
  }

  private commandFailed(failure: FinancialCommandFailure): void {
    switch (resubmissionPolicy(this.options.operation, failure)) {
      case 'sameRequestSanctionedByCore':
        this.outcomeState.set({ status: 'unresolved', failure });
        return;
      case 'sameKeyReplay':
        this.outcomeState.set({ status: 'outcomeUnknown', policy: 'sameKeyReplay' });
        return;
      case 'blockedUntilCF74':
        this.block();
        this.end('outcomeUncertain');
        return;
      case 'retryAllowed':
        this.outcomeState.set({ status: 'notSubmitted', lastFailure: failure });
        return;
      case 'notPermitted':
        this.outcomeState.set({ status: 'refused', failure });
        this.end(failure.kind === 'sessionOrAuthorityRevoked' ? 'revoked' : 'spent');
        return;
    }
  }

  /** A no-key command whose outcome is not known: its target is blocked and the secret, which may not be resent, discarded. */
  private block(): void {
    if (this.binding !== null) this.options.uncertain.block(this.binding);
    this.outcomeState.set({ status: 'outcomeUnknown', policy: 'blockedUntilCF74' });
    this.holder?.discardAll();
  }

  private applied(result: R, via: 'answer' | 'reconciliation'): void {
    if (this.binding !== null) this.options.uncertain.resolveApplied(this.binding);
    const receiptId = this.receipt?.receiptId;
    this.outcomeState.set({ status: 'applied', result, via });
    this.holder?.discardAll();
    this.run += 1;
    // After the intent ended (a proving read), the authorization keeps the reason it ended for.
    if (receiptId !== undefined) this.authorizationState.set({ step: 'consumed', receiptId });
    this.forget();
  }

  /**
   * Ends the intent: the secret is discarded, nothing more can be sent and later answers are dropped. A command still in flight
   * or unresolved on a no-key route leaves its target blocked, since its outcome can no longer be learnt by repeating it. The
   * binding and context stay, so a proving read (`reconcile`) is still possible for the same actor.
   */
  private end(reason: AuthorizationEnd, issueFailure: ReceiptIssueFailure | null = null): void {
    const status = this.outcomeState().status;
    if (status === 'submitted' || (status === 'unresolved' && this.noKeyRoute)) {
      if (this.noKeyRoute) this.block();
      else this.outcomeState.set({ status: 'outcomeUnknown', policy: 'sameKeyReplay' });
    }
    this.holder?.discardAll();
    this.reconciling.set(false);
    this.run += 1;
    this.authorizationState.set({ step: 'ended', reason, issueFailure });
    this.dropSecrets();
  }

  private dropSecrets(): void {
    this.issuanceKey = null;
    this.consumerKey = null;
    this.stepUpProof = null;
    this.receipt = null;
    this.holder = null;
  }

  private forget(): void {
    this.dropSecrets();
    this.captured = null;
    this.binding = null;
  }

  private active(): boolean {
    const step = this.authorizationState().step;
    return step !== 'closed' && step !== 'blocked' && step !== 'consumed' && step !== 'ended';
  }

  private current(run: number): boolean {
    if (run !== this.run) return false;
    if (this.contextHolds()) return true;
    this.end('contextChanged');
    return false;
  }

  private expired(): boolean {
    const receipt = this.receipt;
    return receipt === null || Date.parse(receipt.expiresAt) <= this.options.now();
  }

  private contextHolds(): boolean {
    const now = this.options.context();
    const then = this.captured;
    return (
      now !== null &&
      then !== null &&
      now.actorId === then.actorId &&
      now.sessionKey === then.sessionKey &&
      now.scope === then.scope
    );
  }
}
