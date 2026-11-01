import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Observable, of, switchMap, throwError, timer } from 'rxjs';
import { AuthSession } from '../../../core/auth/auth-session';
import { ReconciliationAnswer } from '../../../core/authorization/financial-authorization-run';
import { RECEIPT_CONSUMERS } from '../../../core/authorization/receipt-failure';
import { ReceiptBindingFor } from '../../../core/authorization/receipt.model';
import { AppError } from '../../../core/errors/app-error';
import { NwButton } from '../../../shared/ui/button/button';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { FinancialAuthorizationDialogs } from '../../financial-authorization/application/financial-authorization.dialogs';
import { OPERATION_TITLE_KEYS } from '../../financial-authorization/domain/financial-authorization.view';
import { FoundationToolbar } from '../components/foundation-toolbar/foundation-toolbar';

/** The operations the preview offers: a route with `Idempotency-Key`, one without (CF-74), and one Core does not offer yet. */
export const PREVIEW_OPERATIONS = ['refund', 'recovery_write_off', 'fraud_hold_place'] as const;
export type PreviewOperation = (typeof PREVIEW_OPERATIONS)[number];

/** The simulated service's answer, each one a documented answer of the operation's consumer (F1-S3 `RECEIPT_CONSUMERS`). */
export const PREVIEW_ANSWERS = [
  'applied',
  'refused',
  'nothingChanged',
  'unresolved',
  'noAnswer',
] as const;
export type PreviewAnswer = (typeof PREVIEW_ANSWERS)[number];

const ANSWER_KEYS = {
  applied: 'financialAuthorization.preview.answers.applied',
  refused: 'financialAuthorization.preview.answers.refused',
  nothingChanged: 'financialAuthorization.preview.answers.nothingChanged',
  unresolved: 'financialAuthorization.preview.answers.unresolved',
  noAnswer: 'financialAuthorization.preview.answers.noAnswer',
} as const satisfies Record<PreviewAnswer, string>;

/** Fictional, canonical ids for the preview's targets (never Core records). */
const ID = 'f1560b00-0000-4000-8000-0000000000';
const id = (n: number): string => `${ID}${String(n).padStart(2, '0')}`;
const LATENCY_MS = 400;

/** What the simulated service answers when it "applied" the request: nothing financial happens anywhere. */
export interface SimulatedResult {
  readonly simulated: true;
}

/**
 * The simulated service: answers after a short delay with one of the consumer's documented answers. It sends nothing and changes
 * nothing; its "check the result" read never proves an application.
 */
export function simulatedAnswer(
  operation: PreviewOperation,
  answer: PreviewAnswer,
  latencyMs = LATENCY_MS,
): Observable<SimulatedResult> {
  const consumer = RECEIPT_CONSUMERS[operation];
  const fail = (error: AppError) => timer(latencyMs).pipe(switchMap(() => throwError(() => error)));
  switch (answer) {
    case 'applied':
      return timer(latencyMs).pipe(switchMap(() => of({ simulated: true as const })));
    case 'refused':
      return fail({ kind: 'conflict', code: consumer.refused[0], status: 409 });
    case 'nothingChanged':
      return fail({ kind: 'unavailable', code: consumer.noMutation[0], status: 503 });
    case 'unresolved':
      return fail({ kind: 'unavailable', code: consumer.recorded[0], status: 503 });
    case 'noAnswer':
      return fail({ kind: 'network', status: 0 });
  }
}

const notProven = (): Observable<ReconciliationAnswer<SimulatedResult>> =>
  timer(LATENCY_MS).pipe(switchMap(() => of({ applied: false as const })));

/**
 * A development-only preview of the financial authorization dialog (F1-S6b), in the design-foundation gallery (never registered
 * or bundled in production, G0-D6). It opens the real dialog over the real F1-S5 run with the F1-S4 demo receipt adapters and a
 * simulated service; no Billing or Payment command exists or is sent.
 */
@Component({
  selector: 'adm-financial-authorization-preview-page',
  imports: [TranslocoPipe, FoundationToolbar, NwButton, NwControl, NwFormField, NwIcon],
  templateUrl: './financial-authorization-preview.page.html',
  styleUrl: './financial-authorization-preview.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'financial-authorization-preview' },
})
export class FinancialAuthorizationPreviewPage {
  private readonly session = inject(AuthSession);
  private readonly dialogs = inject(FinancialAuthorizationDialogs);

  protected readonly operations = PREVIEW_OPERATIONS;
  protected readonly answers = PREVIEW_ANSWERS;
  protected readonly operationKeys = OPERATION_TITLE_KEYS;
  protected readonly answerKeys = ANSWER_KEYS;
  protected readonly operation = signal<PreviewOperation>('refund');
  protected readonly answer = signal<PreviewAnswer>('applied');
  protected readonly signedIn = computed(() => this.session.actor() !== null);

  protected onOperation(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const match = PREVIEW_OPERATIONS.find((operation) => operation === value);
    if (match) this.operation.set(match);
  }

  protected onAnswer(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const match = PREVIEW_ANSWERS.find((answer) => answer === value);
    if (match) this.answer.set(match);
  }

  protected open(): void {
    const actor = this.session.actor();
    // The owner's own Company (the demo receipt adapter refuses any other); an operator's binding names none.
    const companyId = actor?.kind === 'owner' ? actor.companyId : id(0);
    const answer = this.answer();
    const simulated = { reconcile: notProven, simulatedConsumer: true } as const;
    switch (this.operation()) {
      case 'refund': {
        const binding: ReceiptBindingFor<'refund'> = {
          operation: 'refund',
          audience: 'payment-service',
          companyId,
          refundCaseId: id(1),
          paymentId: id(2),
          amount: 45000,
          currency: 'TND',
          reason: 'duplicate_payment',
        };
        this.dialogs.open({
          operation: 'refund',
          binding,
          submit: () => simulatedAnswer('refund', answer),
          ...simulated,
        });
        return;
      }
      case 'recovery_write_off': {
        const binding: ReceiptBindingFor<'recovery_write_off'> = {
          operation: 'recovery_write_off',
          audience: 'billing-service',
          companyId,
          obligationId: id(3),
          organizationId: id(4),
          amount: 12500,
          currency: 'TND',
        };
        this.dialogs.open({
          operation: 'recovery_write_off',
          binding,
          submit: () => simulatedAnswer('recovery_write_off', answer),
          ...simulated,
        });
        return;
      }
      case 'fraud_hold_place': {
        const binding: ReceiptBindingFor<'fraud_hold_place'> = {
          operation: 'fraud_hold_place',
          audience: 'billing-service',
          companyId,
          holdId: id(5),
          beneficiaryUserId: id(6),
          productId: id(7),
          reason: 'suspected_card_fraud',
        };
        this.dialogs.open({
          operation: 'fraud_hold_place',
          binding,
          submit: () => simulatedAnswer('fraud_hold_place', answer),
          ...simulated,
        });
        return;
      }
    }
  }
}
