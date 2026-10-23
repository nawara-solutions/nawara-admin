import { Injectable, signal } from '@angular/core';
import { AdminIdentityId } from '../../demo/world/records';
import { DEMO_NEW_OPERATORS, DEMO_OPERATORS, DemoAccount, DemoOperator } from './auth.fixtures';
import { Identity } from './auth.model';

/** Core's `MAX_CODE_ATTEMPTS`: five wrong guesses kill a working code or a confirmation code (`operator-code.service.ts`). */
export const CODE_ATTEMPTS = 5;

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

/** Every demo operator: the confirmed ones (working-code sign-in) and the new ones (contact confirmation first). */
export const ALL_DEMO_OPERATORS: readonly DemoOperator[] = [
  ...DEMO_OPERATORS,
  ...DEMO_NEW_OPERATORS,
];

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
  /** The live working code per operator (by user id): wrong guesses left. Issuing replaces; success consumes. */
  readonly workingCodes = new Map<string, number>();
  /** Operators whose contact is confirmed (by user id). Core issues working codes only to them. */
  readonly confirmedOperators = new Set(
    ALL_DEMO_OPERATORS.filter((o) => o.confirmed).map((o) => o.identity.userId),
  );
  /** The confirmation code of each unconfirmed operator: wrong guesses left. Core never reissues it (CF-16). */
  readonly confirmationCodes = new Map(
    ALL_DEMO_OPERATORS.filter((o) => !o.confirmed).map((o) => [o.identity.userId, CODE_ATTEMPTS]),
  );
  /** The simulated Core session; other demo mocks read whose data to answer with from it. */
  readonly signedIn = signal<DemoSignedIn | null>(null);
}
