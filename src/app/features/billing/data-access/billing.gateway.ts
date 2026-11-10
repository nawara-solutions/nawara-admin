import { Observable, throwError } from 'rxjs';
import { CompanyId } from '../../../core/context/scope.model';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { PaymentFollowUps } from '../domain/billing.model';

/**
 * Frontend contract of the Company's payment follow-ups (P7-S3). Core status 🟡 (verified nawara-core `8d89bed`, WP-2.1):
 * Core HAS owner reads beside payments, in development only and never mounted in production: disputes (PAY-09),
 * reconciliation items (PAY-12), balances (R6H-12), refund cases by id (BIL-25), reconciliation cases (BIL-33) and losses
 * (BIL-34) (see `FINANCIAL_OPERATIONS`). None lists payment attempts, invoices or the follow-ups shown here (CF-66, proposed
 * CF-40), so there is no HTTP adapter, and integrating those reads is not authorized. Read only: Admin offers no payment
 * operation (retry, collection, refund), although Core's refund-case commands exist in development.
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
