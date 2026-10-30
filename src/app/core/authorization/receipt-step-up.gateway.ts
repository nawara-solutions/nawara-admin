import { Observable, throwError } from 'rxjs';
import { FactorProof } from '../auth/auth.model';
import { adapterUnavailable } from '../errors/app-error';
import { ReceiptPurpose } from './purpose-registry';
import { ReceiptStepUpProof } from './step-up-proof';

/**
 * The owner's factor-only step-up for a RECEIPT purpose (F1-S4): Core's `POST /auth/admin/step-up` with one of the eight
 * receipt purposes (auth-service `src/owner/step-up.service.ts:59-98`, nawara-core `0044b20`), TOTP or passkey only, never the
 * secret key. Separate from `StepUpGateway` on purpose: its proof can only issue a receipt, never reach a domain route, and the
 * existing gateway and its callers stay unchanged.
 */
export abstract class ReceiptStepUpGateway {
  abstract obtain<P extends ReceiptPurpose>(
    purpose: P,
    proof: FactorProof,
  ): Observable<ReceiptStepUpProof<P>>;
}

/** Every non-demo build: nothing can be verified (never a simulated proof). */
export class UnavailableReceiptStepUpGateway extends ReceiptStepUpGateway {
  obtain<P extends ReceiptPurpose>(
    purpose: P,
    proof: FactorProof,
  ): Observable<ReceiptStepUpProof<P>> {
    void purpose;
    void proof;
    return throwError(adapterUnavailable);
  }
}
