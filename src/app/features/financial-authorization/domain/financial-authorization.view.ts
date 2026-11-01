import { FinancialDecision } from '../../../core/authorization/financial-authority';
import {
  AuthorizationEnd,
  FinancialOutcomeState,
  ReceiptAuthorizationState,
} from '../../../core/authorization/financial-authorization-run';
import { FinancialOperation } from '../../../core/authorization/financial-operation';
import {
  RECEIPT_OPERATION_PURPOSE,
  ReceiptOperation,
} from '../../../core/authorization/purpose-registry';
import { ReceiptBinding } from '../../../core/authorization/receipt.model';

/**
 * The presentation adapter of the financial authorization dialog (F1-S6b): pure functions from the F1-S5 coordinator's two
 * machines, and from the F1-S2b authority decision, to what the dialog shows. It decides nothing about authorization: every
 * transition stays in `FinancialAuthorizationRun`, and Core decides every request.
 */

/** The authority rule (F1-S2b) of each receipt operation: the one whose authorization is exactly that receipt purpose. */
export const RECEIPT_FINANCIAL_OPERATION = {
  refund: 'refund.authorize',
  dispute_decision: 'dispute.decide',
  fraud_hold_place: 'fraudHold.place',
  fraud_hold_release: 'fraudHold.release',
  recovery_surplus_external: 'surplus.recordExternalRepayment',
  late_settlement_apply: 'lateSettlement.apply',
  provider_fact_associate: 'providerFact.associate',
  recovery_write_off: 'recovery.writeOff',
} as const satisfies Readonly<Record<ReceiptOperation, FinancialOperation>>;

/** The dialog title of each operation. */
export const OPERATION_TITLE_KEYS = {
  refund: 'financialAuthorization.operations.refund',
  dispute_decision: 'financialAuthorization.operations.dispute_decision',
  fraud_hold_place: 'financialAuthorization.operations.fraud_hold_place',
  fraud_hold_release: 'financialAuthorization.operations.fraud_hold_release',
  recovery_surplus_external: 'financialAuthorization.operations.recovery_surplus_external',
  late_settlement_apply: 'financialAuthorization.operations.late_settlement_apply',
  provider_fact_associate: 'financialAuthorization.operations.provider_fact_associate',
  recovery_write_off: 'financialAuthorization.operations.recovery_write_off',
} as const satisfies Readonly<Record<ReceiptOperation, string>>;

/** What the step-up is for, shown above the code (`nw-step-up-code` purpose). */
export const OPERATION_PURPOSE_KEYS = {
  refund: 'financialAuthorization.purposes.refund',
  dispute_decision: 'financialAuthorization.purposes.dispute_decision',
  fraud_hold_place: 'financialAuthorization.purposes.fraud_hold_place',
  fraud_hold_release: 'financialAuthorization.purposes.fraud_hold_release',
  recovery_surplus_external: 'financialAuthorization.purposes.recovery_surplus_external',
  late_settlement_apply: 'financialAuthorization.purposes.late_settlement_apply',
  provider_fact_associate: 'financialAuthorization.purposes.provider_fact_associate',
  recovery_write_off: 'financialAuthorization.purposes.recovery_write_off',
} as const satisfies Readonly<Record<ReceiptOperation, string>>;

/** Whether this person may ask for this receipt here (UX only; never proof), and why not. */
export type AuthorizationGate =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: 'signedOut' | 'actorKind' | 'outOfScope' | 'unavailable' | 'notReceipt';
    };

export const REFUSAL_KEYS = {
  signedOut: 'financialAuthorization.refused.signedOut',
  actorKind: 'financialAuthorization.refused.actorKind',
  outOfScope: 'financialAuthorization.refused.outOfScope',
  unavailable: 'financialAuthorization.refused.unavailable',
  notReceipt: 'financialAuthorization.refused.notReceipt',
} as const satisfies Readonly<
  Record<Extract<AuthorizationGate, { allowed: false }>['reason'], string>
>;

/**
 * Opens the dialog's authorization only when the authority decision lets this person attempt the operation AND names exactly
 * this operation's receipt purpose. An operator (whose only financial operation is a delegated fee proposal) is refused before
 * anything is asked of Core.
 */
export function authorizationGate(
  decision: FinancialDecision,
  operation: ReceiptOperation,
): AuthorizationGate {
  if (decision.outcome === 'unavailable') return { allowed: false, reason: 'unavailable' };
  if (decision.outcome === 'refused') return { allowed: false, reason: decision.reason };
  const authorization = decision.authorization;
  if (
    authorization.kind !== 'receipt' ||
    authorization.purpose !== RECEIPT_OPERATION_PURPOSE[operation]
  )
    return { allowed: false, reason: 'notReceipt' };
  return { allowed: true };
}

/** How one binding value is shown: ids and machine codes left to right in mono, amounts in their currency. */
export type SummaryValue =
  | { readonly kind: 'id'; readonly value: string }
  | { readonly kind: 'code'; readonly value: string }
  | { readonly kind: 'money'; readonly amount: number; readonly currency: string }
  | { readonly kind: 'flag'; readonly value: boolean };

export interface SummaryRow {
  /** Catalog key of the field's label. */
  readonly label: string;
  readonly value: SummaryValue;
}

const FIELD_LABEL = {
  companyId: 'financialAuthorization.fields.company',
  refundCaseId: 'financialAuthorization.fields.refundCase',
  paymentId: 'financialAuthorization.fields.payment',
  captureFactId: 'financialAuthorization.fields.captureFact',
  disputeId: 'financialAuthorization.fields.dispute',
  holdId: 'financialAuthorization.fields.hold',
  beneficiaryUserId: 'financialAuthorization.fields.beneficiary',
  productId: 'financialAuthorization.fields.product',
  surplusId: 'financialAuthorization.fields.surplus',
  organizationId: 'financialAuthorization.fields.organization',
  lateSettlementId: 'financialAuthorization.fields.lateSettlement',
  assistanceRequestId: 'financialAuthorization.fields.assistanceRequest',
  factId: 'financialAuthorization.fields.fact',
  targetId: 'financialAuthorization.fields.target',
  obligationId: 'financialAuthorization.fields.obligation',
  reason: 'financialAuthorization.fields.reason',
  reasonCode: 'financialAuthorization.fields.reasonCode',
  decision: 'financialAuthorization.fields.decision',
  kind: 'financialAuthorization.fields.factKind',
  targetType: 'financialAuthorization.fields.targetType',
  legalOverride: 'financialAuthorization.fields.legalOverride',
} as const;

type LabelledField = keyof typeof FIELD_LABEL;
const isLabelled = (key: string): key is LabelledField => Object.hasOwn(FIELD_LABEL, key);

/**
 * The target summary: every field of the binding the receipt will be bound to, in Core's field order, except `operation` and
 * `audience` (shown as the title and the service). Values are shown as Core holds them: amounts in minor units of their
 * currency, codes and ids untranslated (machine values).
 */
export function bindingSummary(binding: ReceiptBinding): readonly SummaryRow[] {
  const rows: SummaryRow[] = [];
  const entries: readonly (readonly [string, unknown])[] = Object.entries(binding);
  const amount = entries.find(([key]) => key === 'amount')?.[1];
  const currency = entries.find(([key]) => key === 'currency')?.[1];
  for (const [key, value] of entries) {
    if (key === 'amount' && typeof amount === 'number' && typeof currency === 'string') {
      rows.push({
        label: 'financialAuthorization.fields.amount',
        value: { kind: 'money', amount, currency },
      });
      continue;
    }
    if (!isLabelled(key)) continue;
    const label = FIELD_LABEL[key];
    if (typeof value === 'boolean') rows.push({ label, value: { kind: 'flag', value } });
    else if (typeof value === 'string')
      rows.push({ label, value: { kind: key.endsWith('Id') ? 'id' : 'code', value } });
  }
  return rows;
}

export type ViewTone = 'neutral' | 'progress' | 'info' | 'success' | 'warning' | 'danger';

export interface ViewLine {
  readonly tone: ViewTone;
  /** Full catalog key. */
  readonly key: string;
}

/** The person's possible moves; the dialog shows them in this order, the last one as the main action. */
export type ViewAction =
  'discard' | 'startAgain' | 'reconcile' | 'replayIssue' | 'repeatIdentical' | 'submit' | 'verify';

export interface FinancialAuthorizationView {
  /** Which body the dialog shows. */
  readonly body: 'code' | 'working' | 'status';
  /** The AUTHORIZATION line (receipt), never about money. */
  readonly authorization: ViewLine;
  /** The FINANCIAL RESULT line, from the consumer's answer only. */
  readonly outcome: ViewLine;
  /** The one message to read now (announced: danger and warning at once, the rest politely). */
  readonly message: ViewLine | null;
  readonly actions: readonly ViewAction[];
  /** Whether closing the dialog is "Cancel" (ends a live intent) or "Close". */
  readonly dismiss: 'cancel' | 'close';
}

export interface ViewInput<R> {
  readonly authorization: ReceiptAuthorizationState;
  readonly outcome: FinancialOutcomeState<R>;
  readonly busy: boolean;
  readonly canRepeatIdentical: boolean;
  readonly canReconcile: boolean;
}

const END_KEYS: Readonly<Record<AuthorizationEnd, string>> = {
  cancelled: 'financialAuthorization.authorization.cancelled',
  contextChanged: 'financialAuthorization.authorization.contextChanged',
  revoked: 'financialAuthorization.authorization.revoked',
  expired: 'financialAuthorization.authorization.expired',
  voided: 'financialAuthorization.authorization.voided',
  issueRefused: 'financialAuthorization.authorization.issueRefused',
  notInBuild: 'financialAuthorization.authorization.notInBuild',
  spent: 'financialAuthorization.authorization.spent',
  outcomeUncertain: 'financialAuthorization.authorization.outcomeUncertain',
};

/** A new intent (new step-up, new keys) is offered only after an end that left nothing sent (§7.2 rule 2). */
const RESTARTABLE: ReadonlySet<AuthorizationEnd> = new Set(['expired', 'voided', 'issueRefused']);

function outcomeLine<R>(outcome: FinancialOutcomeState<R>): ViewLine {
  switch (outcome.status) {
    case 'notSubmitted':
      return outcome.lastFailure === null
        ? { tone: 'neutral', key: 'financialAuthorization.outcome.notSubmitted' }
        : { tone: 'info', key: 'financialAuthorization.outcome.nothingChanged' };
    case 'submitted':
      return { tone: 'progress', key: 'financialAuthorization.outcome.submitted' };
    case 'applied':
      return outcome.via === 'answer'
        ? { tone: 'success', key: 'financialAuthorization.outcome.applied' }
        : { tone: 'success', key: 'financialAuthorization.outcome.appliedByCheck' };
    case 'refused':
      return { tone: 'danger', key: 'financialAuthorization.outcome.refused' };
    case 'unresolved':
      return { tone: 'warning', key: 'financialAuthorization.outcome.unresolved' };
    case 'outcomeUnknown':
      return outcome.policy === 'sameKeyReplay'
        ? { tone: 'warning', key: 'financialAuthorization.outcome.unknownReplay' }
        : { tone: 'danger', key: 'financialAuthorization.outcome.unknownBlocked' };
  }
}

/** Whether the financial outcome needs the person's attention more than the authorization does. */
const outcomeSpeaks = <R>(outcome: FinancialOutcomeState<R>): boolean =>
  outcome.status !== 'notSubmitted' || outcome.lastFailure !== null;

export function financialAuthorizationView<R>(input: ViewInput<R>): FinancialAuthorizationView {
  const { authorization, outcome } = input;
  const outcomeView = outcomeLine(outcome);
  const recovery: ViewAction[] = [];
  if (
    input.canReconcile &&
    (outcome.status === 'unresolved' || outcome.status === 'outcomeUnknown')
  )
    recovery.push('reconcile');
  if (input.canRepeatIdentical) recovery.push('repeatIdentical');
  const status = (
    line: ViewLine,
    actions: readonly ViewAction[],
    dismiss: 'cancel' | 'close',
    message: ViewLine | null = null,
  ): FinancialAuthorizationView => ({
    body: input.busy ? 'working' : 'status',
    authorization: line,
    outcome: outcomeView,
    message: message ?? (outcomeSpeaks(outcome) ? outcomeView : null),
    actions: input.busy ? [] : actions,
    dismiss: input.busy ? 'cancel' : dismiss,
  });

  switch (authorization.step) {
    case 'closed':
      return status(
        { tone: 'neutral', key: 'financialAuthorization.authorization.closed' },
        [],
        'close',
      );
    case 'blocked':
      return status(
        { tone: 'danger', key: 'financialAuthorization.authorization.blocked' },
        [],
        'close',
        {
          tone: 'danger',
          key: 'financialAuthorization.authorization.blocked',
        },
      );
    case 'awaitingFactor':
      return {
        body: 'code',
        authorization: {
          tone: 'neutral',
          key: 'financialAuthorization.authorization.awaitingFactor',
        },
        outcome: outcomeView,
        message: null,
        actions: ['verify'],
        dismiss: 'cancel',
      };
    case 'verifying':
      return {
        body: 'code',
        authorization: { tone: 'progress', key: 'financialAuthorization.authorization.verifying' },
        outcome: outcomeView,
        message: null,
        actions: ['verify'],
        dismiss: 'cancel',
      };
    case 'issuing':
      return status(
        { tone: 'progress', key: 'financialAuthorization.authorization.issuing' },
        [],
        'cancel',
      );
    case 'issueUnknown':
      return status(
        { tone: 'warning', key: 'financialAuthorization.authorization.issueUnknown' },
        authorization.replayed ? [] : ['replayIssue'],
        'cancel',
        { tone: 'warning', key: 'financialAuthorization.authorization.issueUnknown' },
      );
    case 'issued': {
      // Once sent (an unresolved or unknown answer, or "nothing changed"), the receipt is only kept for the same request.
      const sent = outcomeSpeaks(outcome);
      const line: ViewLine = {
        tone: 'info',
        key: authorization.simulated
          ? sent
            ? 'financialAuthorization.authorization.heldSimulated'
            : 'financialAuthorization.authorization.issuedSimulated'
          : sent
            ? 'financialAuthorization.authorization.held'
            : 'financialAuthorization.authorization.issued',
      };
      // Before any submission (or after "nothing changed"): send, or discard. After: only Core-sanctioned repeats or a check.
      if (outcome.status === 'notSubmitted') return status(line, ['discard', 'submit'], 'cancel');
      return status(line, recovery, 'close');
    }
    case 'consumed':
      return status(
        { tone: 'neutral', key: 'financialAuthorization.authorization.consumed' },
        [],
        'close',
      );
    case 'ended': {
      const line: ViewLine = {
        tone: authorization.reason === 'cancelled' ? 'neutral' : 'danger',
        key: END_KEYS[authorization.reason],
      };
      const restart =
        RESTARTABLE.has(authorization.reason) && outcome.status === 'notSubmitted'
          ? (['startAgain'] as const)
          : [];
      return status(line, [...recovery, ...restart], 'close', outcomeSpeaks(outcome) ? null : line);
    }
  }
}
