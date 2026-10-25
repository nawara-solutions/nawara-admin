import { SecurityFactor } from '../data-access/account-security.gateway';

/**
 * Why a confirmed factor cannot be removed from Admin (P9-S4d; docs/design/p9-s4-account-security.md §12):
 * - `lastFactor`: it is the owner's only confirmed factor (Core refuses too: `409 factor_required`);
 * - `noAuthenticator`: no confirmed authenticator app exists, and Admin confirms "it's you" with an authenticator code
 *   only (passkey proof needs the factor chooser);
 * - `lastAuthenticator`: it is the last confirmed authenticator app, so only passkeys would remain and Admin could no
 *   longer confirm any sensitive action (Core would allow it; Admin does not, decision O3).
 */
export type RemovalBlock = 'lastFactor' | 'noAuthenticator' | 'lastAuthenticator';

const confirmed = (factors: readonly SecurityFactor[]) => factors.filter((f) => f.confirmed);

/**
 * Each confirmed factor's position among the confirmed factors of its type, in Core's order (`1`, `2`, …), or `null` when
 * it is the only one of its type (its type alone tells it apart). Unfinished setups have none. Not a name: factors have
 * none (CF-56).
 */
export function factorNumbers(
  factors: readonly SecurityFactor[],
): ReadonlyMap<string, number | null> {
  const numbers = new Map<string, number | null>();
  for (const type of ['totp', 'webauthn'] as const) {
    const ofType = confirmed(factors).filter((f) => f.type === type);
    ofType.forEach((f, i) => numbers.set(f.id, ofType.length > 1 ? i + 1 : null));
  }
  return numbers;
}

/**
 * Whether `target` (a confirmed factor of `factors`) may be removed from Admin, and if not, why. Core stays the
 * authority: this only avoids offering what it would refuse, or what would leave Admin unable to confirm "it's you".
 */
export function removalBlock(
  factors: readonly SecurityFactor[],
  target: SecurityFactor,
): RemovalBlock | null {
  const all = confirmed(factors);
  if (all.length <= 1) return 'lastFactor';
  const authenticators = all.filter((f) => f.type === 'totp');
  if (authenticators.length === 0) return 'noAuthenticator';
  if (target.type === 'totp' && authenticators.length === 1) return 'lastAuthenticator';
  return null;
}

const LABEL_KEYS = {
  totp: {
    plain: 'settings.security.factors.totp',
    numbered: 'settings.security.factors.totpNumbered',
  },
  webauthn: {
    plain: 'settings.security.factors.webauthn',
    numbered: 'settings.security.factors.webauthnNumbered',
  },
} as const satisfies Record<SecurityFactor['type'], { plain: string; numbered: string }>;

/** The label of a factor: its type, numbered when the owner has several of that type (`factorNumbers`). */
export function factorLabel(
  type: SecurityFactor['type'],
  number: number | null,
): { readonly key: string; readonly params: { readonly number?: number } } {
  const keys = LABEL_KEYS[type];
  return number === null
    ? { key: keys.plain, params: {} }
    : { key: keys.numbered, params: { number } };
}
