import { DEMO_STEP_UP_METHODS } from '../auth/auth.mock-state';
import { StepUpPurpose } from '../auth/step-up.gateway';
import {
  AuthLocalPurpose,
  BodyServiceVerifiedPurpose,
  CorePurpose,
  EXCLUDED_CORE_PURPOSES,
  HeaderPurpose,
  PURPOSE_REGISTRY_BASELINE,
  PURPOSE_RULES,
  ReceiptPurpose,
  SecretKeyPurpose,
  ServiceVerifiedPurpose,
  StepUpFactor,
  allowsFactor,
  isCorePurpose,
  purposeRule,
} from './purpose-registry';

/**
 * Core's `STEP_UP_METHODS`, copied verbatim from nawara-core `0044b20`
 * (`apps/auth-service/src/owner/step-up.service.ts:23-100`), in source order: the evidence the registry is checked against.
 */
const CORE_STEP_UP_METHODS: readonly (readonly [string, readonly StepUpFactor[]])[] = [
  ['platform_assignment.grant', ['totp', 'webauthn', 'secret_key']],
  ['platform_assignment.revoke', ['totp', 'webauthn', 'secret_key']],
  ['platform.create', ['totp', 'webauthn', 'secret_key']],
  ['organization.create', ['totp', 'webauthn', 'secret_key']],
  ['operator.create', ['totp', 'webauthn', 'secret_key']],
  ['owner.secret_key.rotate', ['totp', 'webauthn']],
  ['owner.factor.enroll', ['totp', 'webauthn']],
  ['owner.factor.remove', ['totp', 'webauthn']],
  ['owner.password.change', ['totp', 'webauthn']],
  ['join_code.create', ['totp', 'webauthn', 'secret_key']],
  ['join_code.revoke', ['totp', 'webauthn', 'secret_key']],
  ['organization.admin.grant', ['totp', 'webauthn']],
  ['organization.admin.revoke', ['totp', 'webauthn']],
  ['admin_invitation.create', ['totp', 'webauthn']],
  ['admin_invitation.revoke', ['totp', 'webauthn']],
  ['account.suspend', ['totp', 'webauthn']],
  ['account.restore', ['totp', 'webauthn']],
  ['release.withdraw', ['totp', 'webauthn']],
  ['compatibility_policy.change', ['totp', 'webauthn']],
  ['hierarchy.reference.repair', ['totp', 'webauthn']],
  ['refund.authorize', ['totp', 'webauthn']],
  ['audit.legal_hold.place', ['totp', 'webauthn']],
  ['audit.legal_hold.release', ['totp', 'webauthn']],
  ['billing.assistance.correct', ['totp', 'webauthn']],
  ['billing.assistance.dispute.resolve', ['totp', 'webauthn']],
  ['payment.dispute.decide', ['totp', 'webauthn']],
  ['billing.fraud_hold.place', ['totp', 'webauthn']],
  ['billing.fraud_hold.release', ['totp', 'webauthn']],
  ['billing.recovery_surplus.record_external', ['totp', 'webauthn']],
  ['billing.late_settlement.apply', ['totp', 'webauthn']],
  ['payment.provider_fact.associate', ['totp', 'webauthn']],
  ['billing.recovery.write_off', ['totp', 'webauthn']],
];

/** Transport of each purpose, from the route that consumes it (see the citations in purpose-registry.ts). */
const AUTH_LOCAL = [
  'platform_assignment.grant',
  'platform_assignment.revoke',
  'operator.create',
  'owner.secret_key.rotate',
  'owner.factor.enroll',
  'owner.factor.remove',
  'owner.password.change',
  'join_code.create',
  'join_code.revoke',
  'organization.admin.grant',
  'organization.admin.revoke',
  'admin_invitation.create',
  'admin_invitation.revoke',
  'account.suspend',
  'account.restore',
];
const SERVICE_VERIFIED = [
  'platform.create',
  'organization.create',
  'release.withdraw',
  'compatibility_policy.change',
  'audit.legal_hold.place',
  'audit.legal_hold.release',
  'billing.assistance.correct',
  'billing.assistance.dispute.resolve',
];
const RECEIPT = [
  'refund.authorize',
  'payment.dispute.decide',
  'billing.fraud_hold.place',
  'billing.fraud_hold.release',
  'billing.recovery_surplus.record_external',
  'billing.late_settlement.apply',
  'payment.provider_fact.associate',
  'billing.recovery.write_off',
];

const registered = Object.keys(PURPOSE_RULES);
const sorted = (values: readonly string[]) => [...values].sort();

describe('PURPOSE_RULES (Core step-up purposes at 0044b20)', () => {
  it('records the verified baseline: 32 Core purposes', () => {
    expect(CORE_STEP_UP_METHODS).toHaveLength(32);
    expect(PURPOSE_REGISTRY_BASELINE.corePurposeCount).toBe(CORE_STEP_UP_METHODS.length);
    expect(PURPOSE_REGISTRY_BASELINE.revision).toBe('0044b20');
  });

  it('represents every included Core purpose exactly once, and nothing else', () => {
    const included = CORE_STEP_UP_METHODS.map(([purpose]) => purpose).filter(
      (purpose) => !Object.hasOwn(EXCLUDED_CORE_PURPOSES, purpose),
    );
    expect(new Set(registered).size).toBe(registered.length);
    expect(sorted(registered)).toEqual(sorted(included));
    expect(registered).toHaveLength(31);
  });

  it('excludes only the V3-deferred hierarchy repair, with its reason', () => {
    expect(Object.keys(EXCLUDED_CORE_PURPOSES)).toEqual(['hierarchy.reference.repair']);
    expect(EXCLUDED_CORE_PURPOSES['hierarchy.reference.repair']).toMatch(/ADR-0061.*MOVE V3/);
    expect(isCorePurpose('hierarchy.reference.repair')).toBe(false);
    for (const purpose of Object.keys(EXCLUDED_CORE_PURPOSES))
      expect(registered).not.toContain(purpose);
  });

  it("gives each purpose exactly Core's allowed factors", () => {
    for (const [purpose, factors] of CORE_STEP_UP_METHODS) {
      if (!isCorePurpose(purpose)) continue;
      expect(purposeRule(purpose).factors, purpose).toEqual(factors);
    }
  });

  it('classifies each purpose into exactly one transport', () => {
    expect(sorted([...AUTH_LOCAL, ...SERVICE_VERIFIED, ...RECEIPT])).toEqual(sorted(registered));
    for (const purpose of registered) {
      const memberships = [AUTH_LOCAL, SERVICE_VERIFIED, RECEIPT].filter((list) =>
        list.includes(purpose),
      );
      expect(memberships, purpose).toHaveLength(1);
    }
    const transportOf = (purpose: string) =>
      isCorePurpose(purpose) ? purposeRule(purpose).transport : null;
    for (const purpose of AUTH_LOCAL) expect(transportOf(purpose), purpose).toBe('authLocal');
    for (const purpose of SERVICE_VERIFIED)
      expect(transportOf(purpose), purpose).toBe('serviceVerified');
    for (const purpose of RECEIPT) expect(transportOf(purpose), purpose).toBe('receipt');
  });

  it('delivers Audit legal-hold proofs in the body, to audit-service', () => {
    for (const purpose of ['audit.legal_hold.place', 'audit.legal_hold.release'] as const) {
      expect(PURPOSE_RULES[purpose]).toMatchObject({ delivery: 'body', recipient: 'audit' });
    }
  });

  it('delivers every receipt step-up in the body of receipt issuance, to auth-service', () => {
    for (const purpose of RECEIPT) {
      if (!isCorePurpose(purpose)) throw new Error(purpose);
      expect(purposeRule(purpose), purpose).toMatchObject({
        transport: 'receipt',
        delivery: 'body',
        recipient: 'auth',
      });
    }
  });

  it('delivers every other proof in the x-step-up-token header, to its verified recipient', () => {
    const recipients: Record<string, string> = {
      'platform.create': 'organization',
      'organization.create': 'organization',
      'release.withdraw': 'release',
      'compatibility_policy.change': 'release',
      'billing.assistance.correct': 'billing',
      'billing.assistance.dispute.resolve': 'billing',
    };
    for (const purpose of [...AUTH_LOCAL, ...Object.keys(recipients)]) {
      if (!isCorePurpose(purpose)) throw new Error(purpose);
      expect(purposeRule(purpose), purpose).toMatchObject({
        delivery: 'header',
        recipient: recipients[purpose] ?? 'auth',
      });
    }
  });

  it('never allows the secret key for a factor-only purpose', () => {
    for (const [purpose, factors] of CORE_STEP_UP_METHODS) {
      if (!isCorePurpose(purpose)) continue;
      expect(allowsFactor(purpose, 'secret_key'), purpose).toBe(factors.includes('secret_key'));
      expect(allowsFactor(purpose, 'totp'), purpose).toBe(true);
      expect(allowsFactor(purpose, 'webauthn'), purpose).toBe(true);
    }
    for (const purpose of RECEIPT) {
      if (!isCorePurpose(purpose)) throw new Error(purpose);
      expect(allowsFactor(purpose, 'secret_key'), purpose).toBe(false);
    }
  });

  it("agrees with the demo step-up mock's factor table for every purpose it simulates", () => {
    for (const [purpose, factors] of Object.entries(DEMO_STEP_UP_METHODS)) {
      expect(isCorePurpose(purpose), purpose).toBe(true);
      if (isCorePurpose(purpose)) expect(purposeRule(purpose).factors, purpose).toEqual(factors);
    }
  });

  it('types the transports, deliveries and factor rules (compile-time)', () => {
    expectTypeOf<
      AuthLocalPurpose | ServiceVerifiedPurpose | ReceiptPurpose
    >().toEqualTypeOf<CorePurpose>();
    expectTypeOf<AuthLocalPurpose & ReceiptPurpose>().toBeNever();
    expectTypeOf<ServiceVerifiedPurpose & ReceiptPurpose>().toBeNever();
    expectTypeOf<AuthLocalPurpose & ServiceVerifiedPurpose>().toBeNever();
    expectTypeOf<BodyServiceVerifiedPurpose>().toEqualTypeOf<
      'audit.legal_hold.place' | 'audit.legal_hold.release'
    >();
    expectTypeOf<HeaderPurpose & BodyServiceVerifiedPurpose>().toBeNever();
    expectTypeOf<HeaderPurpose & ReceiptPurpose>().toBeNever();
    expectTypeOf<SecretKeyPurpose & ReceiptPurpose>().toBeNever();
    expectTypeOf<'owner.password.change'>().not.toExtend<SecretKeyPurpose>();
    expectTypeOf<'operator.create'>().toExtend<SecretKeyPurpose>();
    expectTypeOf<'hierarchy.reference.repair'>().not.toExtend<CorePurpose>();
    // The existing gateway's purposes are all registered, header-delivered T1/T2 purposes.
    expectTypeOf<StepUpPurpose>().toExtend<HeaderPurpose>();
  });
});
