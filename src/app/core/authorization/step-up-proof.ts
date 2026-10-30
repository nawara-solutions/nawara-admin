import { StepUpGrant, StepUpPurpose } from '../auth/step-up.gateway';
import {
  BodyServiceVerifiedPurpose,
  CorePurpose,
  HeaderPurpose,
  PURPOSE_RULES,
  ReceiptPurpose,
} from './purpose-registry';

declare const transportBrand: unique symbol;
declare const deliveryBrand: unique symbol;

/**
 * A step-up token for exactly ONE Core purpose (F1-S1; docs/design/f1-financial-authorization.md §6.2). The purpose's
 * transport and delivery are part of the type, so a proof can only be passed where Core reads it the same way:
 *
 * - `HeaderStepUpProof`: Auth-local and service-verified routes that read `x-step-up-token`;
 * - `BodyStepUpProof`: Audit legal holds, which read a body `stepUpToken`;
 * - `ReceiptStepUpProof`: only receipt issuance (`POST /auth/admin/authorization-receipts`, body `stepUpToken`); never a
 *   domain route, as Core's `POST /auth/step-up/verify` refuses these purposes.
 *
 * Distributive: a proof for a union of purposes is a union of exact proofs, never one proof valid for several purposes. The
 * brands exist only in the type system. The token is single use and is never stored, logged or put in a URL.
 */
export type StepUpProof<P extends CorePurpose> = P extends CorePurpose
  ? {
      readonly purpose: P;
      readonly token: string;
      /** Core's expiry, UTC ISO 8601 with `Z`. */
      readonly expiresAt: string;
      readonly [transportBrand]: (typeof PURPOSE_RULES)[P]['transport'];
      readonly [deliveryBrand]: (typeof PURPOSE_RULES)[P]['delivery'];
    }
  : never;

export type HeaderStepUpProof<P extends HeaderPurpose = HeaderPurpose> = StepUpProof<P>;
export type BodyStepUpProof<P extends BodyServiceVerifiedPurpose = BodyServiceVerifiedPurpose> =
  StepUpProof<P>;
export type ReceiptStepUpProof<P extends ReceiptPurpose = ReceiptPurpose> = StepUpProof<P>;

/**
 * Types an existing `StepUpGateway` grant as the proof of the purpose it was obtained for. Additive: the gateway, its
 * purposes and its callers are unchanged, and no current caller uses this yet. Only the existing gateway's purposes are
 * accepted (all of them header-delivered), so nothing here can create a body or receipt proof.
 */
export function headerStepUpProof<P extends StepUpPurpose & HeaderPurpose>(
  purpose: P,
  grant: StepUpGrant,
): HeaderStepUpProof<P> {
  // Branding: the two brand properties exist only in the type system, never at runtime.
  return { purpose, token: grant.token, expiresAt: grant.expiresAt } as HeaderStepUpProof<P>;
}
