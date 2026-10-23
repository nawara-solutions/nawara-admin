import { adapterUnavailable } from '../errors/app-error';
import { actionFailureOf, failureKey, retryOf } from './action-failure';

describe('action failures (from AppError kind and documented codes only)', () => {
  it('maps every error kind, by stage', () => {
    expect(
      actionFailureOf({ kind: 'validation', messages: ['x'], status: 400 }, 'execute'),
    ).toEqual({
      kind: 'validation',
      messages: ['x'],
    });
    expect(
      actionFailureOf({ kind: 'conflict', code: 'not_authoritative', status: 409 }, 'execute'),
    ).toEqual({
      kind: 'conflict',
      code: 'not_authoritative',
    });
    expect(
      actionFailureOf({ kind: 'forbidden', code: 'step_up_required', status: 403 }, 'execute'),
    ).toEqual({
      kind: 'verificationRefused',
    });
    expect(
      actionFailureOf({ kind: 'forbidden', code: 'admin_forbidden', status: 403 }, 'execute').kind,
    ).toBe('refused');
    expect(actionFailureOf({ kind: 'not_found', status: 404 }, 'execute').kind).toBe('refused');
    expect(actionFailureOf({ kind: 'unauthenticated', status: 401 }, 'verify').kind).toBe(
      'verificationRefused',
    );
    expect(actionFailureOf({ kind: 'unauthenticated', status: 401 }, 'execute').kind).toBe(
      'refused',
    );
    expect(
      actionFailureOf({ kind: 'rate_limited', retryAfterSeconds: 30, status: 429 }, 'verify'),
    ).toEqual({
      kind: 'rateLimited',
      retryAfterSeconds: 30,
    });
    expect(actionFailureOf(adapterUnavailable(), 'execute').kind).toBe('notInBuild');
    expect(actionFailureOf({ kind: 'unavailable', status: 503 }, 'execute').kind).toBe(
      'unavailable',
    );
  });

  it('treats a lost answer after sending as an unknown outcome, and before sending as unavailable', () => {
    expect(actionFailureOf({ kind: 'network', status: 0 }, 'execute').kind).toBe('outcomeUnknown');
    expect(actionFailureOf({ kind: 'unexpected', status: 500 }, 'execute').kind).toBe(
      'outcomeUnknown',
    );
    expect(actionFailureOf({ kind: 'network', status: 0 }, 'verify').kind).toBe('unavailable');
  });

  it('says what can be done next', () => {
    expect(retryOf({ kind: 'outcomeUnknown' })).toBe('resend');
    expect(retryOf({ kind: 'unavailable' })).toBe('resend');
    expect(retryOf({ kind: 'rateLimited' })).toBe('resend');
    expect(retryOf({ kind: 'verificationRefused' })).toBe('verify');
    expect(retryOf({ kind: 'validation', messages: [] })).toBe('edit');
    for (const kind of ['refused', 'notInBuild', 'stale'] as const)
      expect(retryOf({ kind })).toBe('none');
    expect(retryOf({ kind: 'conflict', code: 'not_authoritative' })).toBe('none');
  });

  it('gives documented codes their own copy, and every other failure its kind’s', () => {
    expect(failureKey({ kind: 'conflict', code: 'not_authoritative' })).toBe(
      'actions.failure.notAuthoritative',
    );
    expect(failureKey({ kind: 'conflict', code: 'idempotency_key_reused' })).toBe(
      'actions.failure.keyReused',
    );
    expect(failureKey({ kind: 'conflict', code: 'something_else' })).toBe(
      'actions.failure.conflict',
    );
    expect(failureKey({ kind: 'rateLimited', retryAfterSeconds: 9 })).toBe(
      'actions.failure.rateLimitedFor',
    );
    expect(failureKey({ kind: 'outcomeUnknown' })).toBe('actions.failure.outcomeUnknown');
  });
});
