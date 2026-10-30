import { Actor } from '../auth/actor';
import { CompanyId, PlatformId } from '../context/scope.model';
import {
  CoreFollowUp,
  FINANCIAL_OPERATIONS,
  FinancialAuthorization,
  FinancialOperation,
  FinancialOperationRule,
  PendingCoreCheck,
} from './financial-operation';

/**
 * Where the person is acting, as the frontend knows it: the Company in scope, the Platform in scope (if any), and the
 * Company's Platforms (the same facts `canEnterPlatform` uses).
 */
export interface FinancialContext {
  readonly companyId: CompanyId | null;
  readonly platformId: PlatformId | null;
  readonly companyPlatforms: readonly PlatformId[];
}

/**
 * The frontend's view of one financial operation for one person (F1-S2b). UX only:
 *
 * - `unavailable`: no Admin user can perform it today; `missing` says what Core lacks. Never an attempt, for anyone.
 * - `refused`: this person may not attempt it here (`signedOut`, the wrong kind of account, or outside their scope).
 * - `mayAttempt`: the person MAY ask Core. It proves nothing: `coreAuthorizationProven` is always `false`, and
 *   `pendingCoreChecks` lists what only Core decides (live authority, delegation, resource ownership, the step-up or
 *   receipt, financial invariants). Core authorizes every request.
 */
export type FinancialDecision =
  | { readonly outcome: 'unavailable'; readonly missing: readonly CoreFollowUp[] }
  | { readonly outcome: 'refused'; readonly reason: 'signedOut' | 'actorKind' | 'outOfScope' }
  | {
      readonly outcome: 'mayAttempt';
      readonly coreAuthorizationProven: false;
      readonly availability: 'developmentOnly' | 'simulationOnly';
      readonly authorization: FinancialAuthorization;
      readonly pendingCoreChecks: readonly PendingCoreCheck[];
      readonly blockedBy: readonly CoreFollowUp[];
    };

export function financialRule(operation: FinancialOperation): FinancialOperationRule {
  return FINANCIAL_OPERATIONS[operation];
}

export function financialDecision(
  actor: Actor | null,
  operation: FinancialOperation,
  context: FinancialContext,
): FinancialDecision {
  const rule = financialRule(operation);
  if (rule.availability === 'unavailable') return { outcome: 'unavailable', missing: rule.missing };
  if (actor === null) return { outcome: 'refused', reason: 'signedOut' };
  // Operators inherit nothing from owners, and owners never take an operator's operation (Core: the actor kind must match).
  if (actor.kind !== rule.actor) return { outcome: 'refused', reason: 'actorKind' };
  if (!inScope(actor, rule.scope, context)) return { outcome: 'refused', reason: 'outOfScope' };
  return {
    outcome: 'mayAttempt',
    coreAuthorizationProven: false,
    availability: rule.availability,
    // Never relaxed for an owner: the step-up or receipt Core asks for travels with the decision unchanged.
    authorization: rule.authorization,
    pendingCoreChecks: rule.pendingCoreChecks,
    blockedBy: rule.blockedBy,
  };
}

/** The operations this person may attempt somewhere in their scope (UX: what a menu could offer; never proof). */
export function attemptableFinancialOperations(actor: Actor | null): readonly FinancialOperation[] {
  if (actor === null) return [];
  return operations().filter((operation) => {
    const rule = FINANCIAL_OPERATIONS[operation];
    return rule.availability !== 'unavailable' && rule.actor === actor.kind;
  });
}

const operations = (): readonly FinancialOperation[] =>
  Object.keys(FINANCIAL_OPERATIONS).filter(isFinancialOperation);

export const isFinancialOperation = (value: string): value is FinancialOperation =>
  Object.hasOwn(FINANCIAL_OPERATIONS, value);

/**
 * The part of Core's scope the browser can mirror: an owner acts in their own Company, and on a Platform of it; an operator
 * only on a Platform assigned to them. An assignment is never a delegation: `fees.propose` still carries `liveDelegation`.
 */
function inScope(actor: Actor, scope: 'company' | 'platform', context: FinancialContext): boolean {
  if (actor.kind === 'owner') {
    if (context.companyId === null || context.companyId !== actor.companyId) return false;
    if (scope === 'company') return true;
    return context.platformId !== null && context.companyPlatforms.includes(context.platformId);
  }
  if (scope !== 'platform') return false;
  return context.platformId !== null && actor.platformAssignments.includes(context.platformId);
}
