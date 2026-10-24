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
  /**
   * Scenario operators (not staff) whose contact is confirmed (by user id). Core issues working codes only to confirmed
   * operators. A staff operator's confirmation is the demo world's (`OperatorProfileRecord`), never kept here.
   */
  readonly confirmedOperators = new Set(
    ALL_DEMO_OPERATORS.filter((o) => o.businessIdentityId === null && o.confirmed).map(
      (o) => o.identity.userId,
    ),
  );
  /** The confirmation code of each unconfirmed operator: wrong guesses left. Core never reissues it (CF-16). */
  readonly confirmationCodes = new Map(
    ALL_DEMO_OPERATORS.filter((o) => !o.confirmed).map((o) => [o.identity.userId, CODE_ATTEMPTS]),
  );
  /** The simulated Core session; other demo mocks read whose data to answer with from it. */
  readonly signedIn = signal<DemoSignedIn | null>(null);

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
};

const stepUpMethodAllowed = (purpose: string, method: DemoStepUpMethod) =>
  DEMO_STEP_UP_METHODS[purpose]?.includes(method) ?? false;
