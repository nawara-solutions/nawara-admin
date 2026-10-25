import { SecurityFactor } from '../data-access/account-security.gateway';
import { factorLabel, factorNumbers, removalBlock } from './factor-removal';

const factor = (id: string, type: SecurityFactor['type'], confirmed = true): SecurityFactor => ({
  id,
  type,
  confirmed,
  createdAt: null,
  lastUsedAt: null,
});
const t1 = factor('t1', 'totp');
const t2 = factor('t2', 'totp');
const p1 = factor('p1', 'webauthn');
const p2 = factor('p2', 'webauthn');
const pending = factor('u', 'totp', false);

describe('factor removal rules (P9-S4d)', () => {
  it('numbers confirmed factors among those of their type, only when there are several; unfinished setups get none', () => {
    const numbers = factorNumbers([t1, p1, t2, pending]);
    expect([...numbers.entries()]).toEqual([
      ['t1', 1],
      ['t2', 2],
      ['p1', null],
    ]);
    expect(factorLabel('totp', 2)).toEqual({
      key: 'settings.security.factors.totpNumbered',
      params: { number: 2 },
    });
    expect(factorLabel('webauthn', null)).toEqual({
      key: 'settings.security.factors.webauthn',
      params: {},
    });
  });

  it('never offers the last confirmed factor (an unfinished setup does not count)', () => {
    expect(removalBlock([t1, pending], t1)).toBe('lastFactor');
    expect(removalBlock([p1], p1)).toBe('lastFactor');
  });

  it('a passkey-only owner cannot confirm it is them in Admin: nothing is removable', () => {
    expect(removalBlock([p1, p2], p1)).toBe('noAuthenticator');
  });

  it('keeps the last authenticator app while only passkeys would remain (Admin proves with a code only)', () => {
    expect(removalBlock([t1, p1], t1)).toBe('lastAuthenticator');
    expect(removalBlock([t1, p1, p2], t1)).toBe('lastAuthenticator');
    expect(removalBlock([t1, p1], p1)).toBeNull();
  });

  it('allows any other confirmed factor, the one that may prove the removal included', () => {
    expect(removalBlock([t1, t2], t1)).toBeNull();
    expect(removalBlock([t1, t2, p1], t2)).toBeNull();
    expect(removalBlock([t1, t2, p1], p1)).toBeNull();
  });
});
