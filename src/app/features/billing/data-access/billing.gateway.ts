import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { PaymentFollowUps } from '../domain/billing.model';

/**
 * Frontend contract of the Company's payment follow-ups (P7-S3). Core status 🟡: Payment and Billing offer no owner read
 * of payment attempts, invoices or settlement (proposed CF-40), so there is no HTTP adapter. Read only: no payment
 * operation (retry, collection, refund) exists for the owner, and none is offered.
 */
export abstract class BillingGateway {
  abstract followUps(company: CompanyId): Observable<PaymentFollowUps>;
}

/** Every non-demo build: no Core contract to call, so the follow-ups are unavailable (never mock data, never a request). */
export class UnavailableBillingGateway extends BillingGateway {
  followUps(): Observable<PaymentFollowUps> {
    return throwError(adapterUnavailable);
  }
}
