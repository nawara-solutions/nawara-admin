import { Observable, throwError } from 'rxjs';
import { adapterUnavailable } from '../errors/app-error';
import { FactorProof } from './auth.model';

/**
 * The purposes a step-up is obtained for. Only documented Core purposes, and only those a built action uses
 * (docs/CORE-INTEGRATION.md §5: `platform.create` for `POST /organization/admin/platforms`). Machine values.
 */
export type StepUpPurpose = 'platform.create';

/** A step-up grant: sent once, immediately, with the one operation of its purpose; never stored. */
export interface StepUpGrant {
  readonly token: string;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly expiresAt: string;
}

/**
 * Frontend contract for the owner's step-up (Core: `POST /auth/admin/step-up` → a single-use, session- and
 * purpose-bound token, ≤ 15 minutes, sent as `x-step-up-token`; docs/CORE-INTEGRATION.md §4). Owners only: operator
 * step-up does not exist in Core (CF-08). No HTTP adapter in this slice.
 */
export abstract class StepUpGateway {
  abstract obtain(purpose: StepUpPurpose, proof: FactorProof): Observable<StepUpGrant>;
}

/** Every non-demo build: no step-up is wired, so nothing can be verified (never a simulated grant). */
export class UnavailableStepUpGateway extends StepUpGateway {
  obtain(): Observable<StepUpGrant> {
    return throwError(adapterUnavailable);
  }
}
