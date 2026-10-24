import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { ActionFailure, failureKey } from '../../../core/actions/action-failure';
import { ActionContext, ActionRun } from '../../../core/actions/action-run';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { ScopeContext } from '../../../core/context/scope-context';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { OperatorCreateDialog } from '../components/operator-create-dialog/operator-create-dialog';
import { CreatedOperator, OperatorAccountGateway } from '../data-access/operator-account.gateway';
import { OperatorDirectoryGateway } from '../data-access/operator-directory.gateway';
import { sameContact } from '../domain/create-operator.model';
import { OperatorContact } from '../domain/operator.model';
import { operatorPath } from './operator-paths';

/**
 * The navigation state the new operator's page is opened with: their id only (never a contact), so it can show the next
 * steps once (P6-S4 design, artboard Created).
 */
export const CREATED_OPERATOR_STATE = 'createdOperatorId';

/** Core's documented code for a contact any account already holds (never says whose). */
export const ACCOUNT_ALREADY_EXISTS = 'account_already_exists';

export const isDuplicateContact = (failure: ActionFailure): boolean =>
  failure.kind === 'conflict' && failure.code === ACCOUNT_ALREADY_EXISTS;

/** Creation copy where the generic one would mislead; otherwise the shared action copy. */
export function createFailureKey(failure: ActionFailure): string {
  if (isDuplicateContact(failure)) return 'operators.create.failure.duplicate';
  switch (failure.kind) {
    case 'outcomeUnknown':
      return 'operators.create.failure.unknown';
    case 'unavailable':
      return 'operators.create.failure.unavailable';
    case 'refused':
      return 'operators.create.failure.refused';
    default:
      return failureKey(failure);
  }
}

/** What a reload of the provisional directory shows after a lost answer (demo state only: Core has no lookup, CF-03). */
export type CreateReconciliation =
  | { readonly state: 'checking' }
  | { readonly state: 'found'; readonly operatorId: string }
  | { readonly state: 'notFound' }
  | { readonly state: 'unchecked' };

/**
 * "Create operator…" on the operator directory (P6-S4), for the Company owner only (Core's `POST /auth/admin/operators`
 * is `@Actors('owner')`; an operator gets `403`, so they are never offered it). One `ActionRun` with the owner's
 * step-up for `operator.create` (authenticator code only in this slice). Route-scoped with the directory.
 *
 * - Exactly one contact, normalized by the dialog; one creation at a time (input is ignored while it is sent).
 * - On success the directory and every view that follows `ScopeContext.revision` reload, a toast confirms without the
 *   contact, and (dialog still open) the new operator's page opens with the next steps: confirmation, then Platform
 *   access, which is never given here.
 * - `409 account_already_exists`: the form again, saying only that the contact is taken (never by whom).
 * - Never resent automatically. After a lost answer (or a `500`: Core's audit failure rolls back, but Admin cannot tell
 *   it from another), the provisional directory (DEMO state) is read again and searched for the contact; found, the
 *   owner may open that operator, without claiming the lost request created it; not found, the outcome stays uncertain
 *   and a new attempt is an explicit action that verifies again. Core itself offers no such lookup (CF-03, CF-32).
 */
@Injectable()
export class OperatorCreateAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly router = inject(Router);
  private readonly gateway = inject(OperatorAccountGateway);
  private readonly directory = inject(OperatorDirectoryGateway);
  private readonly stepUp = inject(StepUpGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);
  private lookup: Subscription | null = null;

  /** Whether creations can be sent in this build. */
  readonly available = this.gateway.available;

  /** Whether the owner may be offered the action at all (UX: Core decides every request). */
  readonly offered = computed(() => this.available && can(this.session.actor(), 'operator.create'));

  readonly run = new ActionRun<OperatorContact, CreatedOperator>({
    context: () => this.context(),
    stepUp: (proof) => this.stepUp.obtain('operator.create', proof),
    execute: (contact, { stepUpToken }) =>
      this.gateway.create(contact, { stepUpToken: stepUpToken ?? '' }),
    settled: (outcome, contact, presented) => {
      if (outcome.ok) {
        this.scope.organizationsChanged();
        this.toasts.show(this.transloco.translate('operators.create.created'), { tone: 'success' });
        if (presented)
          void this.router.navigateByUrl(operatorPath(outcome.result.id), {
            state: { [CREATED_OPERATOR_STATE]: outcome.result.id },
          });
        return;
      }
      if (outcome.failure.kind === 'outcomeUnknown') this.reconcile(contact);
      if (!presented)
        this.toasts.show(
          `${this.transloco.translate('operators.create.notCreated')} ${this.transloco.translate(createFailureKey(outcome.failure))}`,
          { tone: 'danger' },
        );
    },
  });

  /** Whether a creation is under way. */
  readonly busy = computed(() => this.run.busy);

  private readonly found = signal<CreateReconciliation | null>(null);

  /** What the directory showed when it was read again after a lost answer (`null`: no read asked for). */
  readonly reconciliation = this.found.asReadonly();

  /** Opens the dialog (or shows the creation still pending). Nothing for anyone but the owner. */
  open(): void {
    if (!this.offered()) return;
    if (!this.run.reattach()) {
      if (!this.run.open()) return;
      this.clearReconciliation();
    }
    const ref = this.dialogs.open(OperatorCreateDialog, {
      data: this,
      autoFocus: 'input[name="operator-contact"], button[aria-disabled="true"]',
    });
    ref.closed.subscribe(() => {
      this.run.close();
      if (this.run.state().phase === 'closed') this.clearReconciliation();
    });
  }

  /** A new, explicit attempt after a failure (never automatic): it verifies again before anything is sent. */
  retry(): void {
    this.clearReconciliation();
    this.run.retry();
  }

  /** "Check again": read the directory again (never resends). */
  checkAgain(contact: OperatorContact): void {
    this.reconcile(contact);
  }

  /** Opens the operator the directory now shows with this contact (an operator of the owner's own Company). */
  openFound(operatorId: string): void {
    this.run.close();
    void this.router.navigateByUrl(operatorPath(operatorId));
  }

  /** The owner, in their Company; nobody else may run it. */
  private context(): ActionContext | null {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'operator.create')
      ? { actorId: actor.userId, scope: actor.companyId }
      : null;
  }

  private reconcile(contact: OperatorContact): void {
    const actor = this.session.actor();
    this.lookup?.unsubscribe();
    if (actor?.kind !== 'owner') return;
    this.found.set({ state: 'checking' });
    // The page's list reloads too, so whatever exists now shows there.
    this.scope.organizationsChanged();
    this.lookup = this.directory.list(actor.companyId).subscribe({
      next: (operators) => {
        const match = operators.find((o) => sameContact(o.contact, contact));
        this.found.set(
          match === undefined ? { state: 'notFound' } : { state: 'found', operatorId: match.id },
        );
      },
      error: () => this.found.set({ state: 'unchecked' }),
    });
  }

  private clearReconciliation(): void {
    this.lookup?.unsubscribe();
    this.lookup = null;
    this.found.set(null);
  }
}
