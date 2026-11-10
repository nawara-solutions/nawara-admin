import { firstValueFrom } from 'rxjs';
import {
  financialCommandFailureOf,
  resubmissionPolicy,
} from '../../../core/authorization/receipt-failure';
import { toAppError } from '../../../core/errors/app-error';
import {
  PREVIEW_ANSWERS,
  PREVIEW_OPERATIONS,
  PreviewAnswer,
  PreviewOperation,
  simulatedAnswer,
} from './financial-authorization-preview.page';

async function policyOf(operation: PreviewOperation, answer: PreviewAnswer) {
  try {
    await firstValueFrom(simulatedAnswer(operation, answer, 0));
    return 'applied';
  } catch (thrown) {
    return resubmissionPolicy(operation, financialCommandFailureOf(operation, toAppError(thrown)));
  }
}

describe('Financial authorization preview: the simulated service (F1-S6b)', () => {
  it('answers each choice with a documented answer of the operation’s consumer', async () => {
    const expected: Record<PreviewOperation, Record<PreviewAnswer, string>> = {
      refund: {
        applied: 'applied',
        refused: 'notPermitted',
        nothingChanged: 'retryAllowed',
        unresolved: 'sameRequestSanctionedByCore',
        noAnswer: 'sameKeyReplay',
      },
      recovery_write_off: {
        applied: 'applied',
        refused: 'notPermitted',
        nothingChanged: 'retryAllowed',
        unresolved: 'sameRequestSanctionedByCore',
        noAnswer: 'blockedUntilCF74',
      },
      fraud_hold_place: {
        applied: 'applied',
        refused: 'notPermitted',
        nothingChanged: 'retryAllowed',
        unresolved: 'sameRequestSanctionedByCore',
        noAnswer: 'blockedUntilCF74',
      },
    };
    for (const operation of PREVIEW_OPERATIONS)
      for (const answer of PREVIEW_ANSWERS)
        expect(await policyOf(operation, answer)).toBe(expected[operation][answer]);
  });

  it('never previews the S0-C14 recovery-restriction receipts: documented, not executable (WP-2.1)', () => {
    const previewed: readonly string[] = PREVIEW_OPERATIONS;
    expect(previewed).toEqual(['refund', 'recovery_write_off', 'fraud_hold_place']);
    expect(previewed).not.toContain('recovery_restriction_suspend');
    expect(previewed).not.toContain('recovery_restriction_revoke');
  });
});
