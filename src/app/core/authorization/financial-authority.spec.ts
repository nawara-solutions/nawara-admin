import { OperatorActor, OwnerActor } from '../auth/actor';
import { capabilitiesOf } from '../access/capability-policy';
import { companyId, platformId } from '../context/scope.model';
import {
  FinancialContext,
  attemptableFinancialOperations,
  financialDecision,
  isFinancialOperation,
} from './financial-authority';
import { FINANCIAL_OPERATIONS, FinancialOperation } from './financial-operation';

const COMPANY = companyId('company-a');
const OTHER_COMPANY = companyId('company-b');
const PLATFORM = platformId('platform-1');
const OTHER_PLATFORM = platformId('platform-2');

const owner: OwnerActor = {
  kind: 'owner',
  userId: 'owner-1',
  email: 'owner@example.test',
  companyId: COMPANY,
};
const operator: OperatorActor = {
  kind: 'operator',
  userId: 'operator-1',
  email: 'operator@example.test',
  platformAssignments: [PLATFORM],
};

/** In scope for both: the owner's Company with one of its Platforms, which the operator is assigned to. */
const inScope: FinancialContext = {
  companyId: COMPANY,
  platformId: PLATFORM,
  companyPlatforms: [PLATFORM],
};

const all = Object.keys(FINANCIAL_OPERATIONS).filter(isFinancialOperation);
const attemptable = all.filter(
  (operation) => FINANCIAL_OPERATIONS[operation].availability !== 'unavailable',
);
const unavailable = all.filter(
  (operation) => FINANCIAL_OPERATIONS[operation].availability === 'unavailable',
);
const actorOf = (operation: FinancialOperation): 'owner' | 'operator' | null => {
  const rule = FINANCIAL_OPERATIONS[operation];
  return rule.availability === 'unavailable' ? null : rule.actor;
};
const ownerOnly = attemptable.filter((operation) => actorOf(operation) === 'owner');

describe('financialDecision', () => {
  describe('unavailable operations', () => {
    it.each(unavailable)(
      '%s is unavailable for everyone, with its missing prerequisite',
      (operation) => {
        for (const actor of [owner, operator, null]) {
          const decision = financialDecision(actor, operation, inScope);
          expect(decision.outcome).toBe('unavailable');
          if (decision.outcome === 'unavailable')
            expect(decision.missing.length).toBeGreaterThan(0);
        }
      },
    );
  });

  describe('actors', () => {
    it.each(attemptable)('%s is refused when signed out', (operation) => {
      expect(financialDecision(null, operation, inScope)).toEqual({
        outcome: 'refused',
        reason: 'signedOut',
      });
    });

    it.each(ownerOnly)('%s is owner-only: an operator is refused', (operation) => {
      expect(financialDecision(operator, operation, inScope)).toEqual({
        outcome: 'refused',
        reason: 'actorKind',
      });
    });

    it.each(ownerOnly)(
      '%s may be attempted by the owner in scope, with Core proving nothing yet',
      (operation) => {
        const rule = FINANCIAL_OPERATIONS[operation];
        const decision = financialDecision(owner, operation, inScope);
        expect(decision.outcome).toBe('mayAttempt');
        if (decision.outcome !== 'mayAttempt' || rule.availability === 'unavailable') return;
        expect(decision.coreAuthorizationProven).toBe(false);
        expect(decision.pendingCoreChecks).toContain('liveAuthority');
        // Owner status never relaxes the step-up or receipt.
        expect(decision.authorization).toEqual(rule.authorization);
        expect(['developmentOnly', 'simulationOnly']).toContain(decision.availability);
      },
    );

    it('refuses fee proposals to an owner (an operator operation)', () => {
      expect(financialDecision(owner, 'fees.propose', inScope)).toEqual({
        outcome: 'refused',
        reason: 'actorKind',
      });
    });
  });

  describe('fee proposals (operators)', () => {
    it('may be attempted on an assigned Platform, with the live owner delegation still pending in Core', () => {
      const decision = financialDecision(operator, 'fees.propose', inScope);
      expect(decision).toMatchObject({ outcome: 'mayAttempt', coreAuthorizationProven: false });
      if (decision.outcome === 'mayAttempt') {
        expect(decision.pendingCoreChecks).toContain('liveDelegation');
        expect(decision.blockedBy).toContain('CF-72');
      }
    });

    it('is refused on an unassigned Platform: the assignment, not the Company, is the operator scope', () => {
      const context: FinancialContext = {
        ...inScope,
        platformId: OTHER_PLATFORM,
        companyPlatforms: [OTHER_PLATFORM],
      };
      expect(financialDecision(operator, 'fees.propose', context)).toEqual({
        outcome: 'refused',
        reason: 'outOfScope',
      });
    });

    it('is refused without a Platform in scope', () => {
      expect(financialDecision(operator, 'fees.propose', { ...inScope, platformId: null })).toEqual(
        {
          outcome: 'refused',
          reason: 'outOfScope',
        },
      );
    });
  });

  describe('scopes', () => {
    it.each(ownerOnly)('%s is refused in another Company', (operation) => {
      const context: FinancialContext = { ...inScope, companyId: OTHER_COMPANY };
      expect(financialDecision(owner, operation, context)).toEqual({
        outcome: 'refused',
        reason: 'outOfScope',
      });
    });

    const platformScoped = ownerOnly.filter((operation) => {
      const rule = FINANCIAL_OPERATIONS[operation];
      return rule.availability !== 'unavailable' && rule.scope === 'platform';
    });

    it.each(platformScoped)(
      "%s is refused on a Platform outside the owner's Company",
      (operation) => {
        const context: FinancialContext = { ...inScope, platformId: OTHER_PLATFORM };
        expect(financialDecision(owner, operation, context)).toEqual({
          outcome: 'refused',
          reason: 'outOfScope',
        });
      },
    );

    it.each(platformScoped)('%s is refused without a Platform in scope', (operation) => {
      expect(financialDecision(owner, operation, { ...inScope, platformId: null })).toEqual({
        outcome: 'refused',
        reason: 'outOfScope',
      });
    });

    it('lets a Company-scoped owner operation run without a Platform (Core checks the resource)', () => {
      const decision = financialDecision(owner, 'refund.authorize', {
        ...inScope,
        platformId: null,
      });
      expect(decision.outcome).toBe('mayAttempt');
      if (decision.outcome === 'mayAttempt') {
        expect(decision.pendingCoreChecks).toContain('resourceOwnership');
        expect(decision.authorization).toEqual({ kind: 'receipt', purpose: 'refund.authorize' });
      }
    });

    it('refuses an owner with no Company in context', () => {
      expect(financialDecision(owner, 'refundCase.read', { ...inScope, companyId: null })).toEqual({
        outcome: 'refused',
        reason: 'outOfScope',
      });
    });
  });
});

describe('attemptableFinancialOperations', () => {
  it('offers an operator fee proposals only, an owner every owner operation, and nobody an unavailable one', () => {
    expect(attemptableFinancialOperations(operator)).toEqual(['fees.propose']);
    expect([...attemptableFinancialOperations(owner)].sort()).toEqual([...ownerOnly].sort());
    expect(attemptableFinancialOperations(null)).toEqual([]);
    for (const operation of unavailable)
      expect(attemptableFinancialOperations(owner)).not.toContain(operation);
  });
});

describe('existing runtime capability policy', () => {
  it('is unchanged: operators hold no capability, the owner the same 22', () => {
    expect(capabilitiesOf(operator).size).toBe(0);
    expect([...capabilitiesOf(owner)].sort()).toEqual(
      [
        'company.scope',
        'company.overview.view',
        'company.platforms.view',
        'company.operators.view',
        'company.commercial.view',
        'company.audit.view',
        'company.services.view',
        'company.releases.view',
        'company.settings.view',
        'account.security.view',
        'account.factor.add',
        'account.secret_key.rotate',
        'account.factor.remove',
        'account.password.change',
        'operator.platformAccess.change',
        'operator.account.block',
        'operator.create',
        'platform.create',
        'organization.create',
        'platform.commercial.view',
        'platform.activity.view',
        'platform.access.view',
      ].sort(),
    );
  });
});
