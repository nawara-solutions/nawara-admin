import { firstValueFrom } from 'rxjs';
import { toAppError } from '../errors/app-error';
import { ReceiptStepUpProof } from './step-up-proof';
import { receiptIssueFailureOf } from './receipt-failure';
import { UnavailableAuthorizationReceiptGateway } from './receipt.gateway';

describe('UnavailableAuthorizationReceiptGateway (F1-S3)', () => {
  it('issues nothing and sends nothing: every build reports the contract unavailable', async () => {
    const fetchSpy = typeof globalThis.fetch === 'function' ? vi.spyOn(globalThis, 'fetch') : null;
    const open = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const gateway = new UnavailableAuthorizationReceiptGateway();
    const uuid = '00000000-0000-4000-8000-000000000001';
    // A branded proof is created only by a step-up adapter; a test builds the shape it would carry.
    const stepUp = { purpose: 'refund.authorize', token: uuid, expiresAt: '2026-10-30T12:05:00Z' };
    let caught: unknown = null;
    try {
      await firstValueFrom(
        gateway.issue({
          binding: {
            operation: 'refund',
            audience: 'payment-service',
            companyId: uuid,
            refundCaseId: uuid,
            paymentId: uuid,
            amount: 1500,
            currency: 'TND',
            reason: 'customer_request',
          },
          stepUp: stepUp as ReceiptStepUpProof<'refund.authorize'>,
          idempotencyKey: 'test-key-0001',
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(receiptIssueFailureOf(toAppError(caught))).toEqual({ kind: 'contractUnavailable' });
    if (fetchSpy) expect(fetchSpy).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
