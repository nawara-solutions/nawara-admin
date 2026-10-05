import { DemoSignInHint } from '../config/app-environment';
import {
  DEMO_COMPANY_ID,
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../context/scope-directory.fixtures';
import { Grants, Identity, MfaMethod } from './auth.model';
import { OperatorIdentifier } from './operator-identifier';

/**
 * FICTIONAL demo accounts (docs/ARCHITECTURE.md §3). Not Core data and not a Core contract: the emails use the
 * reserved `.invalid` domain, and the password and code below exist only in development builds.
 */
export const DEMO_PASSWORD = 'nawara-demo-2026';
export const DEMO_TOTP_CODE = '123456';

export interface DemoAccount {
  /** Password accounts always have an email (the sign-in identifier). */
  readonly identity: Identity & { readonly email: string };
  readonly grants: Grants;
  /** What the mock's `POST /auth/login` answers for this account's valid credentials. */
  readonly next:
    | { readonly kind: 'session' }
    | { readonly kind: 'mfa'; readonly methods: readonly MfaMethod[] }
    | { readonly kind: 'enrollment' }
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
  grants: { companyId: DEMO_COMPANY_ID, platformAssignments: [] },
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
  grants: { companyId: null, platformAssignments: [] },
  next: { kind: 'session' },
};

/** Owners whose sign-in stops at Core's `enrollment_required` / `recovery_required` (screens not in this prototype). */
export const DEMO_ENROLLMENT_ACCOUNT: DemoAccount = {
  identity: {
    userId: '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e03',
    email: 'enrollment@demo.nawara.invalid',
    phone: null,
    adminTier: 'owner',
  },
  grants: { companyId: DEMO_COMPANY_ID, platformAssignments: [] },
  next: { kind: 'enrollment' },
};

export const DEMO_RECOVERY_ACCOUNT: DemoAccount = {
  identity: {
    userId: '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e04',
    email: 'recovery@demo.nawara.invalid',
    phone: null,
    adminTier: 'owner',
  },
  grants: { companyId: DEMO_COMPANY_ID, platformAssignments: [] },
  next: { kind: 'recovery' },
};

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  DEMO_OWNER_ACCOUNT,
  DEMO_MEMBER_ACCOUNT,
  DEMO_ENROLLMENT_ACCOUNT,
  DEMO_RECOVERY_ACCOUNT,
];

/** The one demo working code, a string with a leading zero (codes are never numbers). */
export const DEMO_WORKING_CODE = '042917';

/**
 * How the mock's operator routes answer for a scenario: `normal` follows Core (204, then 200 for the right code or the
 * generic 401); the others simulate Core's `429 rate_limited` on request or verify, and an unavailable service on
 * verify, so each banner can be reviewed.
 */
export type DemoOperatorScenario =
  'normal' | 'requestLimited' | 'verifyLimited' | 'verifyUnavailable';

export interface DemoOperator {
  readonly identifier: OperatorIdentifier;
  readonly identity: Identity;
  readonly grants: Grants;
  readonly scenario: DemoOperatorScenario;
}

const operator = (
  n: number,
  identifier: OperatorIdentifier,
  platforms: Grants['platformAssignments'],
  scenario: DemoOperatorScenario = 'normal',
): DemoOperator => ({
  identifier,
  identity: {
    userId: `9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e${(10 + n).toString()}`,
    email: identifier.kind === 'email' ? identifier.email : null,
    phone: identifier.kind === 'phone' ? identifier.phone : null,
    adminTier: 'operator',
  },
  grants: { companyId: null, platformAssignments: platforms },
  scenario,
});

const email = (value: string): OperatorIdentifier => ({ kind: 'email', email: value });

/**
 * FICTIONAL operators (development builds only). Emails use the reserved `.invalid` domain; the phone-only operator uses
 * the unassigned `+999` country code, so no identifier here can reach a real person.
 */
export const DEMO_OPERATORS: readonly DemoOperator[] = [
  operator(1, email('operator.school@demo.nawara.invalid'), [DEMO_SCHOOL_PLATFORM_ID]),
  operator(2, email('operator.multi@demo.nawara.invalid'), [
    DEMO_SCHOOL_PLATFORM_ID,
    DEMO_DRIVE_PLATFORM_ID,
  ]),
  operator(3, { kind: 'phone', phone: '+99900000001' }, [DEMO_DRIVE_PLATFORM_ID]),
  operator(4, email('operator.unassigned@demo.nawara.invalid'), []),
  operator(
    5,
    email('operator.busy@demo.nawara.invalid'),
    [DEMO_SCHOOL_PLATFORM_ID],
    'requestLimited',
  ),
  operator(
    6,
    email('operator.limited@demo.nawara.invalid'),
    [DEMO_SCHOOL_PLATFORM_ID],
    'verifyLimited',
  ),
  operator(
    7,
    email('operator.offline@demo.nawara.invalid'),
    [DEMO_SCHOOL_PLATFORM_ID],
    'verifyUnavailable',
  ),
];

const OPERATOR_ROLE_KEYS = [
  'auth.demo.operatorSingle',
  'auth.demo.operatorMulti',
  'auth.demo.operatorPhone',
  'auth.demo.operatorUnassigned',
  'auth.demo.operatorRequestLimited',
  'auth.demo.operatorVerifyLimited',
  'auth.demo.operatorUnavailable',
] as const;

export const DEMO_SIGN_IN_HINT: DemoSignInHint = {
  accounts: [
    { email: DEMO_OWNER_ACCOUNT.identity.email, roleKey: 'auth.demo.owner' },
    { email: DEMO_MEMBER_ACCOUNT.identity.email, roleKey: 'auth.demo.member' },
    { email: DEMO_ENROLLMENT_ACCOUNT.identity.email, roleKey: 'auth.demo.enrollment' },
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
};
