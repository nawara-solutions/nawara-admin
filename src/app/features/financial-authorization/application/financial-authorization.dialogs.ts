import { DialogRef } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';
import { AuthSession } from '../../../core/auth/auth-session';
import { financialDecision } from '../../../core/authorization/financial-authority';
import {
  FinancialAuthorizationRun,
  FinancialAuthorizationRunOptions,
  FinancialRunContext,
} from '../../../core/authorization/financial-authorization-run';
import { ReceiptOperation } from '../../../core/authorization/purpose-registry';
import { AuthorizationReceiptGateway } from '../../../core/authorization/receipt.gateway';
import { ReceiptIssueRequest } from '../../../core/authorization/receipt.model';
import { ReceiptStepUpGateway } from '../../../core/authorization/receipt-step-up.gateway';
import { UncertainFinancialTargets } from '../../../core/authorization/uncertain-financial-targets';
import { ScopeContext } from '../../../core/context/scope-context';
import { AdminScope } from '../../../core/context/scope.model';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { FinancialAuthorizationDialog } from '../components/financial-authorization-dialog/financial-authorization-dialog';
import {
  AuthorizationGate,
  RECEIPT_FINANCIAL_OPERATION,
  authorizationGate,
} from '../domain/financial-authorization.view';

/**
 * What a caller asks for: ONE receipt operation on a binding it has just read from Core, and the consumer command the receipt
 * authorizes. The consumer receives the secret holder, never a value; in F1-S6b only fakes exist (no Billing or Payment
 * command is wired anywhere).
 */
export interface FinancialAuthorizationRequest<O extends ReceiptOperation, R> {
  readonly operation: O;
  readonly binding: ReceiptIssueRequest<O>['binding'];
  readonly submit: FinancialAuthorizationRunOptions<O, R>['submit'];
  readonly reconcile?: NonNullable<FinancialAuthorizationRunOptions<O, R>['reconcile']>;
  /** The consumer is a simulation (a demo or test fake): the dialog says so beside every financial result. */
  readonly simulatedConsumer?: boolean;
}

/**
 * The part of the F1-S5 run the dialog may use: its two machines and the person's moves. Every rule (single flight, keys,
 * expiry, disposal, what may be repeated) stays in the run.
 */
export type FinancialAuthorizationControls<O extends ReceiptOperation = ReceiptOperation> = Pick<
  FinancialAuthorizationRun<O, unknown>,
  | 'authorization'
  | 'outcome'
  | 'busy'
  | 'open'
  | 'verify'
  | 'replayIssue'
  | 'submit'
  | 'repeatIdentical'
  | 'canRepeatIdentical'
  | 'reconcile'
  | 'checkExpiry'
  | 'checkContext'
  | 'cancel'
>;

/** What the dialog receives: the gate, the run it drives, and what to show. Nothing else reaches the component. */
export interface FinancialAuthorizationDialogData<O extends ReceiptOperation = ReceiptOperation> {
  readonly operation: O;
  /** A private copy for display; the run holds its own frozen copy for what is authorized. */
  readonly binding: ReceiptIssueRequest<O>['binding'];
  readonly gate: AuthorizationGate;
  readonly run: FinancialAuthorizationControls<O>;
  readonly reconcilable: boolean;
  readonly simulatedConsumer: boolean;
  /**
   * The run's context, read from the opener's session and scope (signals). The dialog watches it so that a sign-out, another
   * account or another scope ends the intent at once; the run itself compares it again before every send and on every answer.
   */
  readonly context: () => FinancialRunContext | null;
}

/** The scope part of the run's context: a change of Company or Platform ends the intent. */
const scopeKey = (scope: AdminScope): string =>
  scope.kind === 'platform' ? `platform:${scope.platformId}` : 'company';

/**
 * Opens the financial authorization dialog for one intent (F1-S6b): the narrow adapter between a caller and the F1-S5
 * `FinancialAuthorizationRun`. It reads the authority decision (F1-S2b) for the operation's rule, builds one run per intent
 * with the bound receipt gateways (the demo adapters in the financial authorization preview, `unavailable` elsewhere), the
 * tab's uncertain-target register and Core's clock, and hands both to the dialog. It never sends anything itself.
 */
@Injectable()
export class FinancialAuthorizationDialogs {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly stepUp = inject(ReceiptStepUpGateway);
  private readonly receipts = inject(AuthorizationReceiptGateway);
  private readonly uncertain = inject(UncertainFinancialTargets);
  private readonly now = inject(NW_CLOCK);
  private readonly dialogs = inject(NwDialogService);

  /** The run's context: who, in which session (`AuthSession.epoch`), in which scope; `null` when signed out. */
  readonly context = (): FinancialRunContext | null => {
    const actor = this.session.actor();
    if (actor === null) return null;
    return {
      actorId: actor.userId,
      sessionKey: String(this.session.epoch()),
      scope: scopeKey(this.scope.scope()),
    };
  };

  /** Whether this person may ask for the operation's receipt here (UX only). */
  gate(operation: ReceiptOperation): AuthorizationGate {
    const actor = this.session.actor();
    const scope = this.scope.scope();
    const decision = financialDecision(actor, RECEIPT_FINANCIAL_OPERATION[operation], {
      companyId: actor?.kind === 'owner' ? actor.companyId : null,
      platformId: scope.kind === 'platform' ? scope.platformId : null,
      companyPlatforms: [],
    });
    return authorizationGate(decision, operation);
  }

  open<O extends ReceiptOperation, R>(
    request: FinancialAuthorizationRequest<O, R>,
  ): DialogRef<unknown, FinancialAuthorizationDialog> {
    const run = new FinancialAuthorizationRun<O, R>({
      operation: request.operation,
      context: this.context,
      stepUp: this.stepUp,
      receipts: this.receipts,
      submit: request.submit,
      ...(request.reconcile === undefined ? {} : { reconcile: request.reconcile }),
      uncertain: this.uncertain,
      now: this.now,
    });
    const data: FinancialAuthorizationDialogData<O> = {
      operation: request.operation,
      binding: structuredClone(request.binding),
      gate: this.gate(request.operation),
      run,
      reconcilable: request.reconcile !== undefined,
      simulatedConsumer: request.simulatedConsumer === true,
      context: this.context,
    };
    return this.dialogs.open(FinancialAuthorizationDialog, {
      data,
      // The code when it is asked for; otherwise the dismiss button (a refusal or a blocked target).
      autoFocus: 'input[name="step-up-code"], [data-autofocus]',
    });
  }
}
