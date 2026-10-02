import { DemoSignInHint } from '../config/app-environment';
import { DEMO_COMPANY_ID } from '../context/scope-directory.fixtures';
import { Grants, Identity, MfaMethod } from './auth.model';

/**
 * FICTIONAL demo accounts (docs/ARCHITECTURE.md §3). Not Core data and not a Core contract: the emails use the
 * reserved `.invalid` domain, and the password and code below exist only in development builds.
 */
export const DEMO_PASSWORD = 'nawara-demo-2026';
export const DEMO_TOTP_CODE = '123456';

export interface DemoAccount {
  readonly identity: Identity;
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
    adminTier: 'owner',
  },
  grants: { companyId: DEMO_COMPANY_ID, platformAssignments: [] },
  next: { kind: 'enrollment' },
};

export const DEMO_RECOVERY_ACCOUNT: DemoAccount = {
  identity: {
    userId: '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e04',
    email: 'recovery@demo.nawara.invalid',
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

export const DEMO_SIGN_IN_HINT: DemoSignInHint = {
  accounts: [
    { email: DEMO_OWNER_ACCOUNT.identity.email, roleKey: 'auth.demo.owner' },
    { email: DEMO_MEMBER_ACCOUNT.identity.email, roleKey: 'auth.demo.member' },
    { email: DEMO_ENROLLMENT_ACCOUNT.identity.email, roleKey: 'auth.demo.enrollment' },
    { email: DEMO_RECOVERY_ACCOUNT.identity.email, roleKey: 'auth.demo.recovery' },
  ],
  password: DEMO_PASSWORD,
  code: DEMO_TOTP_CODE,
};
