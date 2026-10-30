import { InjectionToken, Provider, inject } from '@angular/core';
import { Observable, defer, delay, of, switchMap, throwError, timer } from 'rxjs';
import { NW_CLOCK } from '../../shared/format/clock';
import { DemoWorld } from '../../demo/world/demo-world';
import { grantsOf } from '../../demo/world/selectors';
import { DEMO_TOTP_CODE } from '../auth/auth.fixtures';
import { DemoAuthState } from '../auth/auth.mock-state';
import { FactorProof } from '../auth/auth.model';
import { DEMO_LATENCY_MS } from '../context/scope-directory.mock';
import { AppError } from '../errors/app-error';
import {
  DEMO_RECEIPT_STEP_UP_LIFETIME_MS,
  DemoReceiptRefusal,
  DemoReceiptState,
  bindingProblem,
  canonicalBinding,
} from './authorization-receipt.mock-state';
import {
  RECEIPT_OPERATION_PURPOSE,
  ReceiptOperation,
  ReceiptPurpose,
  allowsFactor,
} from './purpose-registry';
import { AuthorizationReceiptGateway } from './receipt.gateway';
import { IssuedReceipt, ReceiptIssueRequest } from './receipt.model';
import { ReceiptSecret } from './receipt-secret';
import { ReceiptStepUpGateway } from './receipt-step-up.gateway';
import { ReceiptStepUpProof, receiptStepUpProof } from './step-up-proof';

/**
 * Which answer the demo receipt adapter gives (F1-S4), so every outcome can be reviewed. Demo builds use `normal`.
 * - `unavailable`: `503 receipt_unavailable` before anything changes;
 * - `outcomeUnknown`: the receipt IS recorded, then `503 receipt_outcome_unknown` (Core: replay the same key);
 * - `responseLost`: the receipt IS recorded, then no answer at all (a network failure).
 */
export type ReceiptDemoScenario = 'normal' | 'unavailable' | 'outcomeUnknown' | 'responseLost';

export const RECEIPT_DEMO_SCENARIO = new InjectionToken<ReceiptDemoScenario>(
  'RECEIPT_DEMO_SCENARIO',
  {
    factory: () => 'normal',
  },
);

const refusalError = (code: DemoReceiptRefusal): AppError => {
  switch (code) {
    case 'receipt_binding_invalid':
    case 'idempotency_key_required':
      return { kind: 'validation', code, messages: [], status: 400 };
    case 'step_up_required':
    case 'authority_revoked':
      return { kind: 'forbidden', code, status: 403 };
    default:
      return { kind: 'conflict', code, status: 409 };
  }
};

/** base64url of 32 random bytes (43 characters), Core's secret shape. The value is wrapped at once and never kept here. */
function randomSecret(): ReceiptSecret {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const value = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return ReceiptSecret.fromIssued(value);
}

/**
 * Demo adapter (demo builds only): SIMULATED factor-only step-up for a receipt purpose. The signed-in owner proves the demo
 * code or the simulated passkey; the proof is bound to the owner, this session and the purpose, lives 300 s, and can only issue
 * a demo receipt. Nothing is asked of, or issued by, Nawara Core. An operator is refused (Core has no operator step-up).
 */
export class MockReceiptStepUpGateway extends ReceiptStepUpGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly auth = inject(DemoAuthState);
  private readonly receipts = inject(DemoReceiptState);
  private readonly now = inject(NW_CLOCK);

  obtain<P extends ReceiptPurpose>(
    purpose: P,
    proof: FactorProof,
  ): Observable<ReceiptStepUpProof<P>> {
    return defer(() => {
      const fail = (error: AppError) =>
        timer(this.latency).pipe(switchMap(() => throwError(() => error)));
      const session = this.auth.signedIn();
      if (session === null || this.auth.sessionRevoked(session))
        return fail({ kind: 'unauthenticated', status: 401 });
      if (session.identity.adminTier !== 'owner')
        return fail({ kind: 'forbidden', code: 'admin_forbidden', status: 403 });
      const factor = proof.method === 'passkey' ? 'webauthn' : 'totp';
      if (!allowsFactor(purpose, factor))
        return fail({ kind: 'validation', code: 'step_up_unsupported', messages: [], status: 400 });
      const valid = proof.method === 'passkey' || proof.code.replace(/\s/g, '') === DEMO_TOTP_CODE;
      if (!valid) return fail({ kind: 'unauthenticated', status: 401 });
      const expiresAt = this.now() + DEMO_RECEIPT_STEP_UP_LIFETIME_MS;
      const token = this.receipts.issueStepUp({
        purpose,
        userId: session.identity.userId,
        sessionId: session.sessionId,
        expiresAt,
        factor,
      });
      return of(
        receiptStepUpProof(purpose, { token, expiresAt: new Date(expiresAt).toISOString() }),
      ).pipe(delay(this.latency));
    });
  }
}

/**
 * Demo adapter (demo builds only): SIMULATED authorization-receipt issuance (F1-S4), following Core's order at `0044b20`:
 * session and owner, key format, replay rules, binding (exact fields, values, audience, the owner's own Company), then the
 * step-up of exactly the operation's purpose for this session. A refusal changes nothing. Every receipt is marked `simulated`
 * and is never a Core receipt; its secret is never stored, logged or kept here.
 */
export class MockAuthorizationReceiptGateway extends AuthorizationReceiptGateway {
  private readonly latency = inject(DEMO_LATENCY_MS);
  private readonly scenario = inject(RECEIPT_DEMO_SCENARIO);
  private readonly auth = inject(DemoAuthState);
  private readonly receipts = inject(DemoReceiptState);
  private readonly world = inject(DemoWorld);
  private readonly now = inject(NW_CLOCK);

  issue<O extends ReceiptOperation>(request: ReceiptIssueRequest<O>): Observable<IssuedReceipt<O>> {
    return defer(() => {
      const fail = (error: AppError) =>
        timer(this.latency).pipe(switchMap(() => throwError(() => error)));
      const refuse = (code: DemoReceiptRefusal) => fail(refusalError(code));
      const session = this.auth.signedIn();
      if (session === null || this.auth.sessionRevoked(session))
        return fail({ kind: 'unauthenticated', status: 401 });
      if (session.identity.adminTier !== 'owner') return fail({ kind: 'forbidden', status: 403 });
      if (!this.receipts.validKey(request.idempotencyKey))
        return refuse('idempotency_key_required');
      if (this.scenario === 'unavailable')
        return fail({ kind: 'unavailable', code: 'receipt_unavailable', status: 503 });
      if (bindingProblem(request.binding) !== null) return refuse('receipt_binding_invalid');

      const userId = session.identity.userId;
      const now = this.now();
      const replay = this.receipts.replay(
        userId,
        request.idempotencyKey,
        canonicalBinding(request.binding),
        now,
      );
      if (replay !== null) return refuse(replay);

      const companyId = grantsOf(this.world.snapshot(), session.businessIdentityId).companyId;
      if (companyId === null) return refuse('authority_revoked');
      if (request.binding.companyId !== companyId) return refuse('receipt_binding_invalid');

      const operation: ReceiptOperation = request.binding.operation;
      const purpose = RECEIPT_OPERATION_PURPOSE[operation];
      if (request.stepUp.purpose !== purpose) return refuse('step_up_required');
      if (!this.receipts.takeStepUp(request.stepUp.token, purpose, userId, session.sessionId, now))
        return refuse('step_up_required');

      const secret = randomSecret();
      const recorded = this.receipts.record(secret, {
        userId,
        companyId,
        key: request.idempotencyKey,
        binding: request.binding,
        now,
      });
      if (this.scenario === 'outcomeUnknown') {
        secret.discard();
        return fail({ kind: 'unavailable', code: 'receipt_outcome_unknown', status: 503 });
      }
      if (this.scenario === 'responseLost') {
        secret.discard();
        return fail({ kind: 'network', status: 0 });
      }
      const issued: IssuedReceipt<O> = {
        receiptId: recorded.receiptId,
        secret,
        expiresAt: new Date(recorded.expiresAt).toISOString(),
        binding: request.binding,
        simulated: true,
      };
      return of(issued).pipe(delay(this.latency));
    });
  }
}

export const MOCK_AUTHORIZATION_RECEIPT_PROVIDERS: readonly Provider[] = [
  { provide: ReceiptStepUpGateway, useClass: MockReceiptStepUpGateway },
  { provide: AuthorizationReceiptGateway, useClass: MockAuthorizationReceiptGateway },
];
