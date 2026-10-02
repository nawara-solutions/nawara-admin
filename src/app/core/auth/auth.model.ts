import { CompanyId, PlatformId } from '../context/scope.model';

/**
 * Frontend domain types of Core authentication (docs/CORE-INTEGRATION.md §3, §4). Shaped after Auth's documented
 * outcomes; the exact request and response fields are still to verify against Auth's OpenAPI before the HTTP adapter
 * (docs/CORE-INTEGRATION.md §9, CF-15).
 */

/** An owner sign-in factor Core can offer with `mfa_required`. Unknown values from Core are dropped by the mapper. */
export type MfaMethod = 'totp' | 'passkey';

/**
 * Core's `mfa_required` answer. The token is opaque, held in memory by the sign-in flow only, never displayed, stored
 * or logged. `methods` keeps Core's order: the first one is shown first.
 */
export interface MfaChallenge {
  readonly token: string;
  readonly methods: readonly MfaMethod[];
}

/** What `POST /auth/login` answers for valid credentials. Errors arrive as `AppError`. */
export type LoginOutcome =
  | { readonly kind: 'session' }
  | { readonly kind: 'mfa_required'; readonly challenge: MfaChallenge }
  | { readonly kind: 'enrollment_required' }
  | { readonly kind: 'recovery_required' };

/** The browser's answer to a passkey prompt, passed to Core unread. */
export interface PasskeyAssertion {
  readonly credential: unknown;
}

/** The WebAuthn request options Core issues for a passkey challenge, passed to the browser unread. */
export interface PasskeyRequest {
  readonly publicKey: PublicKeyCredentialRequestOptions;
}

export type FactorProof =
  | { readonly method: 'totp'; readonly code: string }
  | { readonly method: 'passkey'; readonly assertion: PasskeyAssertion };

/** `GET /auth/me`: who is signed in. `adminTier` is `null` for an account that is not an Admin user. */
export interface Identity {
  readonly userId: string;
  readonly email: string;
  readonly adminTier: 'owner' | 'operator' | null;
  /** Core returns no name (email and phone only); only demo fixtures set one. */
  readonly displayName?: string;
}

/** `GET /auth/grants`: authorization facts. Only the fields Admin's landing needs. */
export interface Grants {
  readonly companyId: CompanyId | null;
  readonly platformAssignments: readonly PlatformId[];
}
