import { DemoSignInHint } from '../config/app-environment';
import { AdminIdentityId } from '../../demo/world/records';
import {
  DEMO_OPERATOR_CONFIRMED,
  DEMO_OPERATOR_CONTACTS,
  DEMO_OPERATOR_IDS,
  DEMO_OWNER_ID,
} from '../../demo/world/seed';
import { Identity, MfaMethod } from './auth.model';
import { OperatorIdentifier } from './operator-identifier';

/**
 * FICTIONAL demo accounts (docs/ARCHITECTURE.md §3). Not Core data and not a Core contract: the emails use the
 * reserved `.invalid` domain, and the password and code below exist only in development builds.
 */
export const DEMO_PASSWORD = 'nawara-demo-2026';
export const DEMO_TOTP_CODE = '123456';

/**
 * The one FICTIONAL authenticator setup key (base32, 160 bits) the mock issues on enrollment. Not a Core secret. The mock
 * never computes TOTP: it accepts `DEMO_TOTP_CODE`, so an entry added from this key will not produce accepted codes.
 */
export const DEMO_TOTP_SECRET = 'DEMOKEYNAWARAADMINFICTIONAL23456';

/** Provisional issuer label of the demo `otpauth` URI. Core's real one is its `totp.issuer` setting (not decided). */
export const DEMO_TOTP_ISSUER = 'Nawara Admin';

/**
 * How the mock's enrollment routes answer for an owner who must enroll: `normal` follows Core (begin, then the right code
 * signs in; a wrong code uses one of the token's attempts); the others simulate Core's `403 factor_already_enrolled`,
 * `429 rate_limited` on begin or on confirmation, and an unavailable service on begin or on confirmation.
 */
export type DemoEnrollmentScenario =
  | 'normal'
  | 'alreadyEnrolled'
  | 'confirmLimited'
  | 'beginLimited'
  | 'beginUnavailable'
  | 'confirmUnavailable';

export interface DemoAccount {
  /** Password accounts always have an email (the sign-in identifier). */
  readonly identity: Identity & { readonly email: string };
  /**
   * The demo world's business identity this account signs in as (its grants are derived from the world's records), or
   * `null` for an account that is not Company staff. The enrollment and recovery owners are sign-in scenarios of the
   * ONE Company owner: their own user ids and credentials keep each scenario independent.
   */
  readonly businessIdentityId: AdminIdentityId | null;
  /** What the mock's `POST /auth/login` answers for this account's valid credentials. */
  readonly next:
    | { readonly kind: 'session' }
    | { readonly kind: 'mfa'; readonly methods: readonly MfaMethod[] }
    | { readonly kind: 'enrollment'; readonly scenario: DemoEnrollmentScenario }
    | { readonly kind: 'recovery' };
}

export const DEMO_OWNER_ACCOUNT: DemoAccount = {
  identity: {
    userId: '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e01',
    email: 'owner@demo.nawara.invalid',
    phone: null,
    adminTier: 'owner',
    displayName: 'Salim Anouar',
  },
  businessIdentityId: DEMO_OWNER_ID,
  next: { kind: 'mfa', methods: ['totp', 'passkey'] },
};

/**
 * A fictional authenticated account without usable administrative access (no admin tier, no grants). Which real Core
 * account kinds land here is still to verify (CF-15); this is not a Core actor classification.
 */
export const DEMO_MEMBER_ACCOUNT: DemoAccount = {
  identity: {
    userId: '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e02',
    email: 'member@demo.nawara.invalid',
    phone: null,
    adminTier: null,
  },
  businessIdentityId: null,
  next: { kind: 'session' },
};

const enrollmentOwner = (
  userIdSuffix: string,
  email: string,
  scenario: DemoEnrollmentScenario,
): DemoAccount => ({
  identity: {
    userId: `9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e${userIdSuffix}`,
    email,
    phone: null,
    adminTier: 'owner',
  },
  businessIdentityId: DEMO_OWNER_ID,
  next: { kind: 'enrollment', scenario },
});

/** Owners whose sign-in answers Core's `enrollment_required`: they set up an authenticator (A4-S4), one per scenario. */
export const DEMO_ENROLLMENT_ACCOUNT = enrollmentOwner(
  '03',
  'enrollment@demo.nawara.invalid',
  'normal',
);

export const DEMO_ENROLLMENT_SCENARIO_ACCOUNTS: readonly DemoAccount[] = [
  enrollmentOwner('31', 'enrollment.enrolled@demo.nawara.invalid', 'alreadyEnrolled'),
  enrollmentOwner('32', 'enrollment.limited@demo.nawara.invalid', 'confirmLimited'),
  enrollmentOwner('33', 'enrollment.offline@demo.nawara.invalid', 'confirmUnavailable'),
  enrollmentOwner('34', 'enrollment.unavailable@demo.nawara.invalid', 'beginUnavailable'),
  enrollmentOwner('35', 'enrollment.busy@demo.nawara.invalid', 'beginLimited'),
];

/** An owner whose sign-in stops at Core's `recovery_required` (recovery is not in this prototype). */
export const DEMO_RECOVERY_ACCOUNT: DemoAccount = {
  identity: {
    userId: '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e04',
    email: 'recovery@demo.nawara.invalid',
    phone: null,
    adminTier: 'owner',
  },
  businessIdentityId: DEMO_OWNER_ID,
  next: { kind: 'recovery' },
};

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  DEMO_OWNER_ACCOUNT,
  DEMO_MEMBER_ACCOUNT,
  DEMO_ENROLLMENT_ACCOUNT,
  ...DEMO_ENROLLMENT_SCENARIO_ACCOUNTS,
  DEMO_RECOVERY_ACCOUNT,
];

/** The demo list's label for each enrollment scenario, by scenario (never by position in the account list). */
const ENROLLMENT_ROLE_KEYS: Readonly<Record<DemoEnrollmentScenario, string>> = {
  normal: 'auth.demo.enrollment',
  alreadyEnrolled: 'auth.demo.enrollmentAlready',
  confirmLimited: 'auth.demo.enrollmentConfirmLimited',
  confirmUnavailable: 'auth.demo.enrollmentConfirmUnavailable',
  beginUnavailable: 'auth.demo.enrollmentBeginUnavailable',
  beginLimited: 'auth.demo.enrollmentBeginLimited',
};

const enrollmentScenarioOf = (account: DemoAccount): DemoEnrollmentScenario =>
  account.next.kind === 'enrollment' ? account.next.scenario : 'normal';

/** The one demo working code, a string with a leading zero (codes are never numbers). */
export const DEMO_WORKING_CODE = '042917';

/** The one demo confirmation code (contact confirmation of a new operator), a string with a leading zero. */
export const DEMO_CONFIRMATION_CODE = '005318';

/**
 * How the mock's operator routes answer for a scenario: `normal` follows Core (204, then 200 for the right code or the
 * generic 401); the others simulate Core's `429 rate_limited` on request, verify or contact confirmation, and an
 * unavailable service on verify or confirmation, so each banner can be reviewed.
 */
export type DemoOperatorScenario =
  | 'normal'
  | 'requestLimited'
  | 'verifyLimited'
  | 'verifyUnavailable'
  | 'confirmLimited'
  | 'confirmUnavailable';

export interface DemoOperator {
  readonly identifier: OperatorIdentifier;
  readonly identity: Identity;
  /**
   * The demo world's operator this account signs in as (its assignments are the world's records), or `null` for a
   * scenario account that only simulates a refused request and never reaches the workspace.
   */
  readonly businessIdentityId: AdminIdentityId | null;
  readonly scenario: DemoOperatorScenario;
  /** Whether the contact starts confirmed. Core issues working codes only to confirmed operators. */
  readonly confirmed: boolean;
}

const operator = (
  n: number,
  identifier: OperatorIdentifier,
  businessIdentityId: AdminIdentityId | null,
  scenario: DemoOperatorScenario = 'normal',
  confirmed = true,
): DemoOperator => ({
  identifier,
  identity: {
    userId: `9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e${(10 + n).toString()}`,
    email: identifier.kind === 'email' ? identifier.email : null,
    phone: identifier.kind === 'phone' ? identifier.phone : null,
    adminTier: 'operator',
  },
  businessIdentityId,
  scenario,
  confirmed,
});

const email = (value: string): OperatorIdentifier => ({ kind: 'email', email: value });

/**
 * A staff operator's sign-in account: its contact and whether it starts confirmed are the demo world's (seed.ts), the one
 * source; only the sign-in account itself (user id, scenario) is defined here.
 */
const staff = (n: number, key: keyof typeof DEMO_OPERATOR_IDS): DemoOperator => {
  const contact = DEMO_OPERATOR_CONTACTS[key];
  return operator(
    n,
    'email' in contact ? email(contact.email) : { kind: 'phone', phone: contact.phone },
    DEMO_OPERATOR_IDS[key],
    'normal',
    DEMO_OPERATOR_CONFIRMED[key],
  );
};

/**
 * FICTIONAL operators (development builds only). Emails use the reserved `.invalid` domain; the phone-only operator uses
 * the unassigned `+999` country code, so no identifier here can reach a real person.
 */
export const DEMO_OPERATORS: readonly DemoOperator[] = [
  staff(1, 'school'),
  staff(2, 'multi'),
  staff(3, 'phone'),
  staff(4, 'unassigned'),
  operator(5, email('operator.busy@demo.nawara.invalid'), null, 'requestLimited'),
  operator(6, email('operator.limited@demo.nawara.invalid'), null, 'verifyLimited'),
  operator(7, email('operator.offline@demo.nawara.invalid'), null, 'verifyUnavailable'),
  // Staff the owner blocked: Core issues no working code and redeems none (P6-S0), so sign-in always fails.
  staff(11, 'blocked'),
];

/**
 * FICTIONAL new operators whose contact is not confirmed yet (development builds only): they confirm it with
 * `DEMO_CONFIRMATION_CODE`, then request a working code like any operator.
 */
export const DEMO_NEW_OPERATORS: readonly DemoOperator[] = [
  staff(8, 'awaitingConfirmation'),
  operator(9, email('operator.new.limited@demo.nawara.invalid'), null, 'confirmLimited', false),
  operator(
    10,
    email('operator.new.offline@demo.nawara.invalid'),
    null,
    'confirmUnavailable',
    false,
  ),
];

const NEW_OPERATOR_ROLE_KEYS = [
  'auth.demo.operatorNew',
  'auth.demo.operatorVerifyLimited',
  'auth.demo.operatorUnavailable',
] as const;

const OPERATOR_ROLE_KEYS = [
  'auth.demo.operatorSingle',
  'auth.demo.operatorMulti',
  'auth.demo.operatorPhone',
  'auth.demo.operatorUnassigned',
  'auth.demo.operatorRequestLimited',
  'auth.demo.operatorVerifyLimited',
  'auth.demo.operatorUnavailable',
  'auth.demo.operatorBlocked',
] as const;

export const DEMO_SIGN_IN_HINT: DemoSignInHint = {
  accounts: [
    { email: DEMO_OWNER_ACCOUNT.identity.email, roleKey: 'auth.demo.owner' },
    { email: DEMO_MEMBER_ACCOUNT.identity.email, roleKey: 'auth.demo.member' },
    { email: DEMO_ENROLLMENT_ACCOUNT.identity.email, roleKey: 'auth.demo.enrollment' },
    ...DEMO_ENROLLMENT_SCENARIO_ACCOUNTS.map((a) => ({
      email: a.identity.email,
      roleKey: ENROLLMENT_ROLE_KEYS[enrollmentScenarioOf(a)],
    })),
    { email: DEMO_RECOVERY_ACCOUNT.identity.email, roleKey: 'auth.demo.recovery' },
  ],
  password: DEMO_PASSWORD,
  code: DEMO_TOTP_CODE,
  operators: DEMO_OPERATORS.map((o, i) => ({
    // Shown as typed: the phone with its formatting, to show that spaces and brackets are accepted.
    identifier: o.identifier.kind === 'email' ? o.identifier.email : '+999 (0000) 0001',
    roleKey: OPERATOR_ROLE_KEYS[i] ?? 'auth.demo.operatorSingle',
  })),
  workingCode: DEMO_WORKING_CODE,
  newOperators: DEMO_NEW_OPERATORS.map((o, i) => ({
    identifier: o.identifier.kind === 'email' ? o.identifier.email : o.identifier.phone,
    roleKey: NEW_OPERATOR_ROLE_KEYS[i] ?? 'auth.demo.operatorNew',
  })),
  confirmationCode: DEMO_CONFIRMATION_CODE,
  enrollmentNote: {
    en: `The QR code contains a fictional setup key. Codes generated by an authenticator app won’t work with this mock: use the demo code ${DEMO_TOTP_CODE}.`,
    fr: `Le code QR contient une clé de configuration fictive. Les codes générés par une application d’authentification ne fonctionneront pas avec cette simulation : utilisez le code de démonstration ${DEMO_TOTP_CODE}.`,
    ar: `يحتوي رمز QR على مفتاح إعداد وهمي. لن تعمل الرموز التي يولّدها تطبيق المصادقة مع هذه المحاكاة: استخدم الرمز التجريبي ${DEMO_TOTP_CODE}.`,
  },
};
