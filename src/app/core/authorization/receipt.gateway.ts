import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';
import { ReceiptOperation } from './purpose-registry';
import { IssuedReceipt, ReceiptIssueRequest } from './receipt.model';

/**
 * Frontend contract of authorization-receipt issuance (F1-S3): Core's `POST /auth/admin/authorization-receipts`
 * (auth-service `src/receipts/authorization-receipt.controller.ts:31-50`, nawara-core `0044b20`). Owners only; the request
 * carries the binding and a receipt-purpose step-up in the body and the `Idempotency-Key` header.
 *
 * Not bound anywhere yet: no demo adapter (F1-S4) and no HTTP adapter (D-A4; Auth's receipt code is not deployed). Issuance
 * is never financial completion.
 */
export abstract class AuthorizationReceiptGateway {
  abstract issue<O extends ReceiptOperation>(
    request: ReceiptIssueRequest<O>,
  ): Observable<IssuedReceipt<O>>;
}

/** Every build today: no adapter exists, so nothing is ever requested (never a simulated receipt). */
export class UnavailableAuthorizationReceiptGateway extends AuthorizationReceiptGateway {
  issue<O extends ReceiptOperation>(request: ReceiptIssueRequest<O>): Observable<IssuedReceipt<O>> {
    void request;
    return throwError(adapterUnavailable);
  }
}
