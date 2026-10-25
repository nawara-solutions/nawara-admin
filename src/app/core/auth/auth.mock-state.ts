import { Injectable, signal } from '@angular/core';
import { contactKey } from '../../demo/world/commands/operator.commands';
import { AdminIdentityId } from '../../demo/world/records';
import {
  DEMO_ACCOUNTS,
  DEMO_NEW_OPERATORS,
  DEMO_OPERATORS,
  DemoAccount,
  DemoOperator,
} from './auth.fixtures';
import { Identity } from './auth.model';

/** Core's `MAX_CODE_ATTEMPTS`: five wrong guesses kill a working code or a confirmation code (`operator-code.service.ts`). */
export const CODE_ATTEMPTS = 5;

/**
 * Core's throttle on adding an authenticator (P9-S4-0, Core `304064f`): begins and confirmations of `factors/totp*`
 * together, 10 an hour per owner (deployment configuration; the default).
 */
export const FACTOR_ENROLLMENT_LIMIT = { requests: 10, windowMs: 60 * 60_000 } as const;

/**
 * One of an owner's simulated second factors, shaped after a row of Core's `GET /auth/admin/factors` (P9-S4-0, Core
 * `304064f`: `id, type, confirmed, createdAt, lastUsedAt`). Metadata only: no TOTP seed, credential, name or secret.
 * `createdAt` and `lastUsedAt` are only what this demo session saw happen; `null` when it saw nothing (a fixture's
 * factor predates the demo, so its creation is unknown, never invented).
 */
export interface DemoFactorRecord {
  readonly id: string;
  readonly type: 'totp' | 'webauthn';
  confirmed: boolean;
  readonly createdAt: string | null;
  lastUsedAt: string | null;
}

/** The fixture owners' confirmed factors, as their sign-in already implies: one per second-factor method they offer. */
function fixtureFactors(): Map<string, DemoFactorRecord[]> {
  const factors = new Map<string, DemoFactorRecord[]>();
  for (const account of DEMO_ACCOUNTS) {
    if (account.identity.adminTier !== 'owner' || account.next.kind !== 'mfa') continue;
    factors.set(
      account.identity.userId,
      account.next.methods.map((method) => ({
        id: crypto.randomUUID(),
        type: method === 'passkey' ? 'webauthn' : 'totp',
        confirmed: true,
        createdAt: null,
        lastUsedAt: null,
      })),
    );
  }
  return factors;
}

/** A pending enrollment: the owner, the factor begun last (if any), and the attempts left on its token. */
export interface PendingEnrollment {
  readonly account: DemoAccount;
  readonly expiresAt: number;
  factorId: string | null;
  attemptsLeft: number;
}

/**
 * The simulated Core session: the account Core would answer `/auth/me` for, and the demo world's business identity it
 * acts as (`null`: not Company staff). Grants are not stored: they are derived from the world's records on each read.
 */
export interface DemoSignedIn {
  readonly identity: Identity;
  readonly businessIdentityId: AdminIdentityId | null;
}

/**
 * A simulated step-up grant (demo builds only). NOT a Core token and not Core evidence: an opaque random string that only
 * the demo mocks recognise, kept in memory, never logged or stored. Bound to the user it was issued to and to one
 * purpose; used once; it expires.
 */
interface DemoStepUp {
  readonly purpose: string;
  readonly userId: string;
  readonly expiresAt: number;
  readonly method: DemoStepUpMethod;
}

/** Every demo operator: the confirmed ones (working-code sign-in) and the new ones (contact confirmation first). */
export const ALL_DEMO_OPERATORS: readonly DemoOperator[] = [
  ...DEMO_OPERATORS,
  ...DEMO_NEW_OPERATORS,
];

/**
 * The uniqueness keys of every sign-in fixture's contact (the owner's and its scenario accounts', the member's, every
 * operator account's), for the accounts the demo world does not keep: Core's contacts are unique across all account
 * kinds, so an operator can never be created with one of them (P6-S4). Never shown: it only answers "taken".
 */
export const DEMO_SIGN_IN_CONTACT_KEYS: ReadonlySet<string> = new Set([
  ...DEMO_ACCOUNTS.map((a) => contactKey({ kind: 'email', email: a.identity.email })),
  ...ALL_DEMO_OPERATORS.map((o) => contactKey(o.identifier)),
]);

/**
 * What the simulated Core remembers (demo builds only): ONE instance for the whole app, so the sign-in routes and the
 * shell, which each bind their own `MockAuthGateway`, talk to the same simulated Auth service. Root-provided, and
 * imported only by the demo mock adapters (reached only through the demo bindings), so a production build never
 * contains it. A reload starts it afresh; each TestBed gets a fresh one.
 *
 * Two kinds of state, with different lifetimes:
 * - Core records (enrolled owners, confirmed contacts, live codes, pending challenges): they survive a sign-out, as
 *   Core's do.
 * - The simulated Core session (`signedIn`): ended by `logout()`.
 *
 * Not the demo world (`DemoWorld`, docs/ROADMAP.md P2.5), which holds the business records: this state refers to it
 * only by business identity, and a sign-out leaves it untouched.
 */
@Injectable({ providedIn: 'root' })
export class DemoAuthState {
  readonly challenges = new Map<string, { account: DemoAccount; expiresAt: number }>();
  readonly enrollments = new Map<string, PendingEnrollment>();
  /** Owners who completed enrollment (by user id): their next sign-in asks for the code. */
  readonly enrolledOwners = new Set<string>();
  /**
   * Each owner's simulated factors (by user id; P9-S4a): seeded from the fixtures, a TOTP added by enrollment, `lastUsedAt`
   * set when a factor proves a sign-in or a step-up. Core records, so they survive a sign-out. Read by the Account
   * security mock only; nothing here is a secret.
   */
  readonly ownerFactors = fixtureFactors();
  /** The live working code per operator (by user id): wrong guesses left. Issuing replaces; success consumes. */
  readonly workingCodes = new Map<string, number>();
  /**
   * Scenario operators (not staff) whose contact is confirmed (by user id). Core issues working codes only to confirmed
   * operators. A staff operator's confirmation is the demo world's (`OperatorProfileRecord`), never kept here.
   */
  readonly confirmedOperators = new Set(
    ALL_DEMO_OPERATORS.filter((o) => o.businessIdentityId === null && o.confirmed).map(
      (o) => o.identity.userId,
    ),
  );
  /**
   * The confirmation code of each unconfirmed operator (by user id): wrong guesses left. Core issues it once, when the
   * owner creates the operator (P6-S4: `issueConfirmationCode`), and never reissues it (CF-16).
   */
  readonly confirmationCodes = new Map(
    ALL_DEMO_OPERATORS.filter((o) => !o.confirmed).map((o) => [o.identity.userId, CODE_ATTEMPTS]),
  );
  /** The simulated Core session; other demo mocks read whose data to answer with from it. */
  readonly signedIn = signal<DemoSignedIn | null>(null);

  /**
   * What Core's block does outside the account row (`operator-admin.service.ts`, P6-S3), for one operator: every unused
   * code is cancelled (working codes and the confirmation code: Core supersedes both) and every session of theirs is
   * revoked (the demo holds at most the one in this tab). Nothing here is ever restored by an unblock: the operator
   * needs a new working code, and a cancelled confirmation code stays cancelled (CF-16: nothing reissues one).
   */
  endOperatorSignIn(operator: AdminIdentityId): void {
    // A fixture account signs in under its own user id; an operator the owner created signs in under its world id.
    const userIds = [
      ...ALL_DEMO_OPERATORS.filter((a) => a.businessIdentityId === operator).map(
        (a) => a.identity.userId,
      ),
      operator,
    ];
    for (const userId of userIds) {
      this.workingCodes.delete(userId);
      this.confirmationCodes.delete(userId);
    }
    if (this.signedIn()?.businessIdentityId === operator) this.signedIn.set(null);
  }

  /**
   * The one confirmation code Core sends a new operator's contact when the owner creates them (P6-S4): the demo's is
   * `DEMO_CONFIRMATION_CODE`, which only the demo sign-in page lists; only its attempts are kept here, never in the
   * world, a URL, storage or a log. Issued once: nothing reissues it (CF-16).
   */
  issueConfirmationCode(userId: string): void {
    this.confirmationCodes.set(userId, CODE_ATTEMPTS);
  }

  /**
   * Like Core's `enroll/totp`: a new, unconfirmed TOTP factor replaces any earlier unconfirmed one (P9-S4a).
   * @returns the factor's id
   */
  beginTotpFactor(userId: string, at: string): string {
    const id = crypto.randomUUID();
    const kept = (this.ownerFactors.get(userId) ?? []).filter(
      (f) => f.type !== 'totp' || f.confirmed,
    );
    this.ownerFactors.set(userId, [
      ...kept,
      { id, type: 'totp', confirmed: false, createdAt: at, lastUsedAt: null },
    ]);
    return id;
  }

  /** Like Core's `confirmTotp`: the factor becomes usable, and the proving code counts as its last use. */
  confirmTotpFactor(userId: string, factorId: string, at: string): void {
    const factor = this.ownerFactors.get(userId)?.find((f) => f.id === factorId);
    if (factor) {
      factor.confirmed = true;
      factor.lastUsedAt = at;
    }
  }

  /** A confirmed factor of this type proved a sign-in or a step-up (Core updates `lastUsedAt` the same way). */
  recordFactorUse(userId: string, type: DemoFactorRecord['type'], at: string): void {
    const factor = this.ownerFactors.get(userId)?.find((f) => f.type === type && f.confirmed);
    if (factor) factor.lastUsedAt = at;
  }

  /** Each owner's recent `factors/totp*` requests (by user id): request times only, for Core's throttle. */
  private readonly factorEnrollmentRequests = new Map<string, number[]>();

  /**
   * Counts one `factors/totp` or `factors/totp/confirm` request of this owner (P9-S4b).
   * @returns `false` when the owner is over Core's limit: the request is refused with `429` and changes nothing
   */
  takeFactorEnrollmentRequest(userId: string, now: number): boolean {
    const recent = (this.factorEnrollmentRequests.get(userId) ?? []).filter(
      (at) => at > now - FACTOR_ENROLLMENT_LIMIT.windowMs,
    );
    const allowed = recent.length < FACTOR_ENROLLMENT_LIMIT.requests;
    this.factorEnrollmentRequests.set(userId, allowed ? [...recent, now] : recent);
    return allowed;
  }

  /**
   * Each owner's simulated secret-key verifier (by user id; P9-S4c): a digest and when it was issued, NEVER the key.
   * Core records, so they survive a sign-out. A fixture owner has none (Core's bootstrapped owner has no key until the
   * first rotation, ADR-0016). Nothing reads it for a page: Core has no existence read (CF-54).
   */
  private readonly secretKeyVerifiers = new Map<string, DemoSecretKeyVerifier>();

  /**
   * Like Core's committed rotation (`secret-key/rotate`): the new verifier replaces any earlier one at once, so the
   * previous key stops matching. The first key and a replacement are the same operation.
   */
  replaceSecretKeyVerifier(userId: string, digest: string, issuedAt: string): void {
    this.secretKeyVerifiers.set(userId, { digest, issuedAt });
  }

  /**
   * Whether `digest` (`demoSecretKeyDigest` of a candidate key) is the owner's CURRENT key's. `false` alike for a wrong
   * key, an old key and no key at all. For the demo mocks and specs only; no gateway exposes it.
   */
  secretKeyMatches(userId: string, digest: string): boolean {
    return this.secretKeyVerifiers.get(userId)?.digest === digest;
  }

  /** Live simulated step-up grants, by token. */
  private readonly stepUps = new Map<string, DemoStepUp>();

  /**
   * Issues a single-use grant for `purpose` to `userId`, valid until `expiresAt`, recording the factor that proved it
   * (Core's `owner_step_up.method`: a purpose accepts only its allowed factors, `DEMO_STEP_UP_METHODS`).
   */
  issueStepUp(
    purpose: string,
    userId: string,
    expiresAt: number,
    method: DemoStepUpMethod = 'totp',
  ): string {
    const token = `demo-step-up-${crypto.randomUUID()}`;
    this.stepUps.set(token, { purpose, userId, expiresAt, method });
    return token;
  }

  /**
   * Whether a grant would be accepted, WITHOUT consuming it: live, issued to `userId` for exactly `purpose`, by a factor
   * that purpose allows. For a command that spends its step-up only when its change commits (auth-service consumes the
   * proof inside the command's transaction, so a refusal rolls it back): check, apply, then `consumeStepUp`.
   */
  checkStepUp(token: string | null, purpose: string, userId: string, now: number): boolean {
    if (token === null) return false;
    const grant = this.stepUps.get(token);
    return (
      grant !== undefined &&
      grant.purpose === purpose &&
      grant.userId === userId &&
      grant.expiresAt > now &&
      stepUpMethodAllowed(purpose, grant.method)
    );
  }

  /**
   * Consumes a grant: true only for a live one issued to `userId` for exactly `purpose`. Any presented token is used up,
   * valid or not, so it can never be tried twice.
   */
  consumeStepUp(token: string | null, purpose: string, userId: string, now: number): boolean {
    if (token === null) return false;
    const grant = this.stepUps.get(token);
    this.stepUps.delete(token);
    return (
      grant !== undefined &&
      grant.purpose === purpose &&
      grant.userId === userId &&
      grant.expiresAt > now &&
      stepUpMethodAllowed(purpose, grant.method)
    );
  }
}

/**
 * DEMO ONLY: a simulated secret-key verifier. `digest` is a plain SHA-256 of the normalised key (`demoSecretKeyDigest`),
 * which is NOT production-grade key protection (Core keeps an HMAC-SHA-256 with a server-side pepper); it only lets the
 * demo model "the old key stops working". The plaintext key is never kept.
 */
interface DemoSecretKeyVerifier {
  readonly digest: string;
  /** UTC instant, ISO 8601 with `Z`. */
  readonly issuedAt: string;
}

/**
 * DEMO ONLY: the simulated verifier digest of a secret key, after removing separators and case (hex SHA-256, Web
 * Crypto). Not how Core protects keys; see `DemoSecretKeyVerifier`.
 */
export async function demoSecretKeyDigest(key: string): Promise<string> {
  const normalised = key.replace(/[^0-9a-z]/gi, '').toUpperCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalised));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export type DemoStepUpMethod = 'totp' | 'webauthn' | 'secret_key';

/**
 * The factors each purpose accepts, as Core's `STEP_UP_METHODS` (auth-service `owner/step-up.service.ts`), for the
 * purposes the demo uses. Admin-invitation and organization-admin role purposes are factor only: never the secret key.
 */
export const DEMO_STEP_UP_METHODS: Readonly<Record<string, readonly DemoStepUpMethod[]>> = {
  'platform.create': ['totp', 'webauthn', 'secret_key'],
  'organization.create': ['totp', 'webauthn', 'secret_key'],
  'admin_invitation.create': ['totp', 'webauthn'],
  'admin_invitation.revoke': ['totp', 'webauthn'],
  'organization.admin.grant': ['totp', 'webauthn'],
  'organization.admin.revoke': ['totp', 'webauthn'],
  // An operator's Platform assignments (P6-S0, Core 750eb21): the secret key is accepted too.
  'platform_assignment.grant': ['totp', 'webauthn', 'secret_key'],
  'platform_assignment.revoke': ['totp', 'webauthn', 'secret_key'],
  // Creating an operator (P6-S4; Core 750eb21): the secret key is accepted too.
  'operator.create': ['totp', 'webauthn', 'secret_key'],
  // Adding a factor (P9-S4b; Core 304064f `owner.factor.enroll`): factor only, never the secret key.
  'owner.factor.enroll': ['totp', 'webauthn'],
  // Creating a new secret key (P9-S4c; Core 304064f `owner.secret_key.rotate`): factor only, never the secret key.
  'owner.secret_key.rotate': ['totp', 'webauthn'],
};

const stepUpMethodAllowed = (purpose: string, method: DemoStepUpMethod) =>
  DEMO_STEP_UP_METHODS[purpose]?.includes(method) ?? false;
