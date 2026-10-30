import { Observable } from 'rxjs';
import { FactorProof } from '../auth/auth.model';
import { StepUpGateway, StepUpGrant, StepUpPurpose } from '../auth/step-up.gateway';
import {
  BodyStepUpProof,
  HeaderStepUpProof,
  ReceiptStepUpProof,
  StepUpProof,
  headerStepUpProof,
} from './step-up-proof';

/**
 * Compile-time checks: each `@ts-expect-error` line MUST fail to type-check, so specs that stop failing break the build.
 * The functions are never called; the values are type-only.
 */
declare const headerProof: HeaderStepUpProof<'platform_assignment.grant'>;
declare const serviceHeaderProof: HeaderStepUpProof<'organization.create'>;
declare const bodyProof: BodyStepUpProof<'audit.legal_hold.place'>;
declare const receiptProof: ReceiptStepUpProof<'refund.authorize'>;
declare const writeOffProof: ReceiptStepUpProof<'billing.recovery.write_off'>;

function sendsHeader(proof: HeaderStepUpProof): void {
  void proof;
}
function sendsBody(proof: BodyStepUpProof): void {
  void proof;
}
function issuesReceipt(proof: ReceiptStepUpProof): void {
  void proof;
}
function placesLegalHold(proof: StepUpProof<'audit.legal_hold.place'>): void {
  void proof;
}
function authorizesRefund(proof: StepUpProof<'refund.authorize'>): void {
  void proof;
}

function compileTimeChecks(): void {
  // Accepted: each proof where Core reads it.
  sendsHeader(headerProof);
  sendsHeader(serviceHeaderProof);
  sendsBody(bodyProof);
  issuesReceipt(receiptProof);
  issuesReceipt(writeOffProof);

  // @ts-expect-error a body proof (Audit legal hold) is not an x-step-up-token header proof
  sendsHeader(bodyProof);
  // @ts-expect-error a header proof is not a body stepUpToken proof
  sendsBody(headerProof);
  // @ts-expect-error a receipt proof is never an ordinary Auth-local or service-verified header proof
  sendsHeader(receiptProof);
  // @ts-expect-error a receipt proof is never a service-verified body proof either
  sendsBody(receiptProof);
  // @ts-expect-error an ordinary header proof cannot issue a receipt
  issuesReceipt(headerProof);
  // @ts-expect-error a service-verified body proof cannot issue a receipt
  issuesReceipt(bodyProof);
  // @ts-expect-error a proof serves exactly its own purpose: a write-off receipt proof is not a refund's
  authorizesRefund(writeOffProof);
  // @ts-expect-error a legal-hold place proof is not a refund proof, although both travel in a body
  authorizesRefund(bodyProof);
  // @ts-expect-error a refund proof is not a legal-hold proof, although both travel in a body
  placesLegalHold(receiptProof);

  // @ts-expect-error only registered purposes have proofs: the V3-deferred hierarchy repair has none
  const repair: StepUpProof<'hierarchy.reference.repair'> = headerProof;
  void repair;
  // @ts-expect-error the bridge from the existing gateway accepts only its own (header) purposes
  headerStepUpProof('refund.authorize', { token: 't', expiresAt: '2026-10-30T12:00:00Z' });
}

describe('step-up proofs (F1-S1)', () => {
  it('keeps header, body and receipt proofs apart at compile time', () => {
    expect(compileTimeChecks).toBeTypeOf('function');
  });

  it('types a grant of the existing gateway as its header proof, adding nothing at runtime', () => {
    const grant: StepUpGrant = { token: 'demo-step-up-1', expiresAt: '2026-10-30T12:05:00Z' };
    const proof = headerStepUpProof('platform.create', grant);
    expect(proof).toEqual({
      purpose: 'platform.create',
      token: 'demo-step-up-1',
      expiresAt: '2026-10-30T12:05:00Z',
    });
    expect(Object.keys(proof)).toEqual(['purpose', 'token', 'expiresAt']);
    expectTypeOf(proof).toEqualTypeOf<HeaderStepUpProof<'platform.create'>>();
  });

  it('leaves the existing StepUpGateway contract unchanged', () => {
    expectTypeOf<StepUpGateway['obtain']>().parameters.toEqualTypeOf<
      [StepUpPurpose, FactorProof]
    >();
    expectTypeOf<StepUpGateway['obtain']>().returns.toEqualTypeOf<Observable<StepUpGrant>>();
    expectTypeOf<StepUpGrant>().toEqualTypeOf<{
      readonly token: string;
      readonly expiresAt: string;
    }>();
  });
});
