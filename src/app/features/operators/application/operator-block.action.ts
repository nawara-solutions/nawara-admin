import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ActionFailure, failureKey } from '../../../core/actions/action-failure';
import { ActionContext, ActionRun } from '../../../core/actions/action-run';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { OperatorBlockDialog } from '../components/operator-block-dialog/operator-block-dialog';
import { OperatorAccountGateway } from '../data-access/operator-account.gateway';
import { OperatorContact, OperatorSummary } from '../domain/operator.model';
import { OperatorDetailFacade } from './operator-detail.facade';

/** One account change: block (`block: true`) or unblock the operator the page shows. */
export interface OperatorBlockInput {
  readonly operatorId: string;
  /** Shown in the dialog only (never in a toast, a URL or a log). */
  readonly contact: OperatorContact;
  readonly block: boolean;
  /** The operator had not confirmed their contact when the dialog opened (the CF-16 warning). */
  readonly unconfirmed: boolean;
  /** Platforms the operator holds active assignments on (named in the dialog; they are kept). */
  readonly assignedPlatforms: number;
}

/**
 * Failures after which the account may have changed, or Admin cannot tell: the account is reloaded (demo state) and the
 * dialog says what it shows. A `500` is among them: Core rolls its audit-failure `500` back, but Admin cannot tell that
 * `500` from another, so it never claims it failed.
 */
export const blockReconciles = (failure: ActionFailure): boolean =>
  failure.kind === 'outcomeUnknown' || failure.kind === 'unavailable' || failure.kind === 'refused';

/** Account-change copy where the generic one would mislead; otherwise the shared action copy. */
export function blockFailureKey(failure: ActionFailure): string {
  switch (failure.kind) {
    case 'outcomeUnknown':
      return 'operators.account.failure.unknown';
    case 'unavailable':
      return 'operators.account.failure.unavailable';
    case 'refused':
      return 'operators.account.failure.refused';
    default:
      return failureKey(failure);
  }
}

/** What a reload of the account shows after a failure. */
export type BlockReconciliation =
  | { readonly state: 'checking' }
  | { readonly state: 'gone' }
  | { readonly state: 'unchecked' }
  | { readonly state: 'known'; readonly blocked: boolean };

/**
 * "Block account" / "Unblock account" (P6-S3) on an operator's details, for the Company owner only (Core's
 * `POST /auth/admin/operators/:id/block|unblock` are `@Actors('owner')`; operators, even on their own record, get
 * `403`, so they are never offered it). One `ActionRun` with NO step-up (Core asks none for this emergency control: a
 * documented residual risk). Route-scoped with the detail facade; one change at a time.
 *
 * - Blocking ends the operator's sessions and cancels their unused codes (Core); unblocking restores neither, and never
 *   confirms an unconfirmed operator (CF-16: nothing reissues the cancelled confirmation code).
 * - Never resent automatically. After a lost answer, a `500`, a `503` or a `404`, the account (DEMO state: Core has no
 *   owner read, CF-03) is reloaded and the dialog says what it shows; a new attempt is a separate, explicit action that
 *   says the earlier one may have applied and that Core records every call.
 */
@Injectable()
export class OperatorBlockAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly gateway = inject(OperatorAccountGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);
  /** The page's operator (the dialog, outside the route's injector, reads it through the action). */
  readonly detail = inject(OperatorDetailFacade);
  private input: OperatorBlockInput | null = null;
  /** The account answer count when a reload was asked for (`null`: none asked). */
  private readonly reconcileFrom = signal<number | null>(null);

  /** Whether changes can be sent in this build. */
  readonly available = this.gateway.available;

  /** The last change that succeeded (the page moves focus to the account section). */
  readonly succeeded = signal<{ readonly block: boolean } | null>(null);

  readonly run = new ActionRun<OperatorBlockInput, void>({
    context: () => this.context(),
    stepUp: null,
    execute: (input) =>
      input.block ? this.gateway.block(input.operatorId) : this.gateway.unblock(input.operatorId),
    settled: (outcome, input, presented) => {
      if (outcome.ok) {
        // The account, the directory and every view that shows the operator's state reload.
        this.scope.organizationsChanged();
        this.succeeded.set({ block: input.block });
        this.toasts.show(
          this.transloco.translate(
            input.block ? 'operators.account.blocked' : 'operators.account.unblocked',
          ),
          { tone: 'success' },
        );
        return;
      }
      if (blockReconciles(outcome.failure)) this.reconcile();
      if (!presented)
        this.toasts.show(
          `${this.transloco.translate('operators.account.notConfirmed')} ${this.transloco.translate(blockFailureKey(outcome.failure))}`,
          { tone: 'danger' },
        );
    },
  });

  /** Whether a change is under way (every account control waits). */
  readonly busy = computed(() => this.run.state().phase === 'pending');

  /** Where the account is according to a reload asked for after the failure (demo state only). */
  readonly reconciliation = computed<BlockReconciliation | null>(() => {
    const from = this.reconcileFrom();
    this.run.state();
    if (from === null || this.input === null) return null;
    const view = this.detail.view();
    if (view.status === 'notFound') return { state: 'gone' };
    if (view.status === 'error' || view.status === 'notInBuild') return { state: 'unchecked' };
    if (this.detail.accountSequence() <= from || view.status !== 'ready')
      return { state: 'checking' };
    return { state: 'known', blocked: view.operator.accountState === 'blocked' };
  });

  /** Whether the owner may be offered account changes at all (UX: Core decides every request). */
  readonly offered = computed(
    () => this.available && can(this.session.actor(), 'operator.account.block'),
  );

  /** The change the open dialog is about. */
  current(): OperatorBlockInput | null {
    return this.input;
  }

  /**
   * Opens the dialog: block for an operator the page shows as not blocked, unblock for one it shows blocked. Nothing for
   * anyone but the owner, or while a change is under way.
   */
  open(operator: OperatorSummary, assignedPlatforms: number): void {
    if (!this.offered() || this.busy()) return;
    const block = operator.accountState !== 'blocked';
    this.input = {
      operatorId: operator.id,
      contact: operator.contact,
      block,
      unconfirmed: operator.accountState === 'awaitingConfirmation',
      assignedPlatforms,
    };
    this.reconcileFrom.set(null);
    if (!this.run.open()) return;
    // Blocking interrupts: an alertdialog, focus on Cancel. Unblocking: a dialog, focus on its confirmation.
    const ref = this.dialogs.open(OperatorBlockDialog, {
      data: this,
      role: block ? 'alertdialog' : 'dialog',
      autoFocus: block ? 'button[data-cancel]' : 'button[data-confirm]',
    });
    ref.closed.subscribe(() => this.run.close());
  }

  /**
   * A new, explicit attempt after a failure (never automatic): the same change sent again. Core repeats are harmless
   * for the account but each call writes another audit record; the dialog says so before this is offered.
   */
  repeat(): void {
    if (this.input === null) return;
    this.reconcileFrom.set(null);
    this.run.submit(this.input);
  }

  /** "Check again": reload the account (never resends). */
  checkStatus(): void {
    this.reconcile();
  }

  /** The owner, in their Company; nobody else may run it. */
  private context(): ActionContext | null {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'operator.account.block')
      ? { actorId: actor.userId, scope: actor.companyId }
      : null;
  }

  private reconcile(): void {
    this.reconcileFrom.set(this.detail.accountSequence());
    this.scope.organizationsChanged();
  }
}
