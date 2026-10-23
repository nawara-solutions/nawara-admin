import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ActionFailure, failureKey } from '../../../core/actions/action-failure';
import { ActionContext, ActionRun } from '../../../core/actions/action-run';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway, StepUpPurpose } from '../../../core/auth/step-up.gateway';
import { ScopeContext } from '../../../core/context/scope-context';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { isolated } from '../../platforms/domain/create-platform.model';
import { OrganizationAdminRoleDialog } from '../components/organization-admin-role-dialog/organization-admin-role-dialog';
import { MembershipGateway } from '../data-access/membership.gateway';
import { roleChangeOf } from '../domain/membership-decision.model';
import { ListableMembershipStatus, Membership } from '../domain/membership.model';
import {
  MembershipActionLock,
  MembershipActionTarget,
  guardedByPlatform,
} from './membership-action-support';
import { OrganizationMembersFacade } from './organization-members.facade';

export interface RoleChangeInput {
  readonly target: MembershipActionTarget;
  /** The membership as it was listed when the owner chose to change its role (shown in the confirmation). */
  readonly membership: Membership;
  /** `true`: make it an organization admin; `false`: remove the role. */
  readonly admin: boolean;
}

/** Core's step-up purpose of each direction (auth-service `STEP_UP_METHODS`: TOTP or WebAuthn, never the secret key). */
export const rolePurposeOf = (admin: boolean): StepUpPurpose =>
  admin ? 'organization.admin.grant' : 'organization.admin.revoke';

/** Role-specific copy where the generic one would mislead; otherwise the shared action copy. */
export function roleFailureKey(failure: ActionFailure): string {
  switch (failure.kind) {
    case 'refused':
      return 'organizations.members.role.failure.notApplied';
    case 'outcomeUnknown':
      return 'organizations.members.role.failure.unknown';
    case 'rateLimited':
      return 'organizations.members.role.failure.rateLimited';
    case 'unavailable':
      return 'organizations.members.role.failure.unavailable';
    default:
      return failureKey(failure);
  }
}

/** Failures after which the role may have changed (or never could): the lists are reloaded and what they show said. */
export const roleReconciles = (failure: ActionFailure): boolean =>
  failure.kind === 'outcomeUnknown' || failure.kind === 'refused';

/** What a reload shows about a membership after an uncertain or refused role change. */
export type RoleReconciliation =
  | { readonly state: 'checking' }
  | {
      readonly state: 'known';
      readonly status: ListableMembershipStatus | null;
      readonly isOrganizationAdmin: boolean | null;
    };

/**
 * "Make organization admin" / "Remove admin role" (P5-S3b): the organization-admin role of an active membership in
 * one Organization, for the Company owner only (Core's `setAdmin`: operators, like anyone else, get the collapsed
 * `404`, so they are never offered it). The owner's step-up for `organization.admin.grant` or `.revoke` (a factor: TOTP
 * or a passkey, never the secret key), then `POST` or `DELETE …/memberships/:membershipId/admin` (`204`). The role is
 * authority within this Organization only: never Company owner or Platform operator authority, never a membership
 * status change. Route-scoped with the members facade; one membership action at a time (`MembershipActionLock`).
 *
 * - A refused verification stays in the verification step. A `404` (not active, the role already changed, gone, no
 *   authority) leaves the step-up unspent and reloads the lists; so does a lost answer, which is never resent. "Try
 *   again" (a new verification) exists only where Core refused before applying anything (`429`, `503`), or once the
 *   reload shows the membership still active with its old role.
 * - Core has no last-admin rule: removing the last listed admin is warned about, never blocked.
 */
@Injectable()
export class OrganizationAdminRoleAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly gateway = inject(MembershipGateway);
  private readonly stepUp = inject(StepUpGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly lock = inject(MembershipActionLock);
  /** The page's lists (the dialog, outside the route's injector, reads them through the action). */
  readonly members = inject(OrganizationMembersFacade);
  private input: RoleChangeInput | null = null;
  /** The lists' answer number when a reload was asked for (`null`: none asked). */
  private readonly reconcileFrom = signal<number | null>(null);

  /** Whether role changes can be sent in this build. */
  readonly available = this.gateway.available;

  /** The membership whose role change succeeded last (the pages move focus on it). */
  readonly succeeded = signal<{ readonly membershipId: string } | null>(null);

  readonly run = new ActionRun<RoleChangeInput, void>({
    context: () => this.context(),
    stepUp: (proof) => this.stepUp.obtain(rolePurposeOf(this.input?.admin ?? true), proof),
    execute: (input, { stepUpToken }) =>
      guardedByPlatform(this.scope, input.target.platformId, () =>
        this.gateway.setOrganizationAdmin(
          input.target.organizationId,
          input.membership.id,
          input.admin,
          {
            stepUpToken: stepUpToken ?? '',
          },
        ),
      ),
    settled: (outcome, input, presented) => {
      const name = isolated(input.target.organizationName);
      if (outcome.ok) {
        this.scope.organizationsChanged();
        this.succeeded.set({ membershipId: input.membership.id });
        this.toasts.show(
          this.transloco.translate(
            input.admin
              ? 'organizations.members.role.granted'
              : 'organizations.members.role.removed',
            { name },
          ),
          { tone: 'success' },
        );
        return;
      }
      if (roleReconciles(outcome.failure)) this.reload();
      if (!presented)
        this.toasts.show(
          `${this.transloco.translate('organizations.members.role.notChanged', { name })} ${this.transloco.translate(roleFailureKey(outcome.failure))}`,
          { tone: 'danger' },
        );
    },
  });

  /** The membership whose role change is being sent, if any (its row shows it). */
  readonly sendingId = computed(() =>
    this.run.state().phase === 'pending' ? (this.input?.membership.id ?? null) : null,
  );

  /** Where the membership and its role are according to a reload asked for after the failure. */
  readonly reconciliation = computed<RoleReconciliation | null>(() => {
    const from = this.reconcileFrom();
    this.run.state();
    const membershipId = this.input?.membership.id ?? null;
    if (from === null || membershipId === null) return null;
    const where = this.members.whereabouts(membershipId);
    return where === null || where.loadSequence <= from
      ? { state: 'checking' }
      : { state: 'known', status: where.status, isOrganizationAdmin: where.isOrganizationAdmin };
  });

  constructor() {
    this.lock.register(this.run.state);
  }

  /** The role change the open dialog is about. */
  current(): RoleChangeInput | null {
    return this.input;
  }

  /**
   * Which role change the owner may be offered on this membership: `grant` for an active member, `remove` for an active
   * organization admin, `null` for anything else and for anyone but the Company owner. The audience plays no part.
   */
  offers(membership: Membership): 'grant' | 'remove' | null {
    const actor = this.session.actor();
    if (!this.available || actor?.kind !== 'owner' || membership.userId === actor.userId)
      return null;
    return roleChangeOf(membership);
  }

  open(input: RoleChangeInput): void {
    const change = this.offers(input.membership);
    if (change === null || (change === 'grant') !== input.admin || this.lock.busy()) return;
    this.input = input;
    this.reconcileFrom.set(null);
    if (!this.run.open()) return;
    // Removing the role interrupts: an alertdialog, focus on Cancel. Granting: a dialog, focus on Continue.
    const ref = this.dialogs.open(OrganizationAdminRoleDialog, {
      data: this,
      role: input.admin ? 'dialog' : 'alertdialog',
      autoFocus: input.admin ? 'button[data-confirm]' : 'button[data-cancel]',
    });
    ref.closed.subscribe(() => this.run.close());
  }

  /** "Check status": reload the lists (never resends). */
  checkStatus(): void {
    this.reload();
  }

  /** The owner, in their Company; nobody else may run it (operators: Core's `404`, so never offered). */
  private context(): ActionContext | null {
    const actor = this.session.actor();
    return actor?.kind === 'owner' ? { actorId: actor.userId, scope: actor.companyId } : null;
  }

  private reload(): void {
    this.reconcileFrom.set(
      this.members.whereabouts(this.input?.membership.id ?? '')?.loadSequence ?? 0,
    );
    this.scope.organizationsChanged();
  }
}
