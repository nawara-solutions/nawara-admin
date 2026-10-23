import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ActionFailure, failureKey } from '../../../core/actions/action-failure';
import { ActionRun } from '../../../core/actions/action-run';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { isolated } from '../../platforms/domain/create-platform.model';
import { RevokeMembershipDialog } from '../components/revoke-membership-dialog/revoke-membership-dialog';
import { MembershipGateway } from '../data-access/membership.gateway';
import { MembershipRevokeResult, isRevocable } from '../domain/membership-decision.model';
import { Membership } from '../domain/membership.model';
import {
  MembershipActionLock,
  MembershipActionTarget,
  guardedByPlatform,
  membershipActionContext,
} from './membership-action-support';
import { Reconciliation } from './membership-decision.action';
import { OrganizationMembersFacade } from './organization-members.facade';

export interface RevokeInput {
  readonly target: MembershipActionTarget;
  /** The membership as it was listed when the person chose to revoke it (shown in the confirmation). */
  readonly membership: Membership;
}

/** Revocation-specific copy where the generic one would mislead; otherwise the shared action copy. */
export function revokeFailureKey(failure: ActionFailure): string {
  switch (failure.kind) {
    case 'conflict':
      return 'organizations.members.revoke.failure.notActive';
    case 'refused':
      return 'organizations.members.revoke.failure.refused';
    case 'outcomeUnknown':
      return 'organizations.members.revoke.failure.unknown';
    case 'rateLimited':
      return 'organizations.members.revoke.failure.rateLimited';
    case 'unavailable':
      return 'organizations.members.revoke.failure.unavailable';
    default:
      return failureKey(failure);
  }
}

/** Failures after which the membership may have changed: the lists are reloaded and what they show is said. */
export const revokeReconciles = (failure: ActionFailure): boolean =>
  failure.kind === 'outcomeUnknown' || failure.kind === 'refused' || failure.kind === 'conflict';

/**
 * "Revoke membership" (P5-S3a): active → revoked in one Organization, for the Company owner and an operator assigned
 * to its Platform, including an organization admin's membership (Core clears the admin role in the same statement;
 * only an organization admin, not an Admin actor, is barred from revoking another admin). Core's
 * `POST …/memberships/:membershipId/revoke`: no body, no step-up (CF-26), no idempotency key. Route-scoped with the
 * members facade; one membership action at a time (`MembershipActionLock`).
 *
 * - A lost answer is never resent: the lists are reloaded. A membership no longer listed as active MAY have been
 *   revoked, but revoked memberships are not listable, so the dialog never says it was proven.
 * - `409 membership_not_active` (someone acted first) and `404` (no longer available) reload the lists too. "Try
 *   again" exists only where Core refused before applying anything (`429`, `503`), or once the reload shows the
 *   membership still active.
 * - Success reloads every view that follows `ScopeContext.revision`. Toasts name the Organization, never the member.
 */
@Injectable()
export class MembershipRevokeAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly gateway = inject(MembershipGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly lock = inject(MembershipActionLock);
  /** The page's lists (the dialog, outside the route's injector, reads them through the action). */
  readonly members = inject(OrganizationMembersFacade);
  private input: RevokeInput | null = null;
  /** The lists' answer number when a reload was asked for (`null`: none asked). */
  private readonly reconcileFrom = signal<number | null>(null);

  /** Whether revocations can be sent in this build. */
  readonly available = this.gateway.available;

  /** The membership whose revocation succeeded last (the pages move focus, or leave the details, on it). */
  readonly succeeded = signal<{ readonly membershipId: string } | null>(null);

  /** Set by the details page as it returns to the list after a revocation: the list focuses its count. */
  readonly returnedFromDetails = signal(false);

  readonly run = new ActionRun<RevokeInput, MembershipRevokeResult>({
    context: () => membershipActionContext(this.session.actor()),
    stepUp: null,
    execute: (input) =>
      guardedByPlatform(this.scope, input.target.platformId, () =>
        this.gateway.revoke(input.target.organizationId, input.membership.id),
      ),
    settled: (outcome, input, presented) => {
      if (outcome.ok) {
        this.scope.organizationsChanged();
        this.succeeded.set({ membershipId: input.membership.id });
        this.toasts.show(
          this.transloco.translate('organizations.members.revoke.revoked', {
            name: isolated(input.target.organizationName),
          }),
          { tone: 'success' },
        );
        return;
      }
      if (revokeReconciles(outcome.failure)) this.reload();
      if (!presented)
        this.toasts.show(
          `${this.transloco.translate('organizations.members.revoke.notRevoked', {
            name: isolated(input.target.organizationName),
          })} ${this.transloco.translate(revokeFailureKey(outcome.failure))}`,
          { tone: 'danger' },
        );
    },
  });

  /** The membership whose revocation is being sent, if any (its row shows it). */
  readonly sendingId = computed(() =>
    this.run.state().phase === 'pending' ? (this.input?.membership.id ?? null) : null,
  );

  /** Where the membership is according to a reload asked for after the failure (`null`: none asked). */
  readonly reconciliation = computed<Reconciliation | null>(() => {
    const from = this.reconcileFrom();
    this.run.state();
    const membershipId = this.input?.membership.id ?? null;
    if (from === null || membershipId === null) return null;
    const where = this.members.whereabouts(membershipId);
    return where === null || where.loadSequence <= from
      ? { state: 'checking' }
      : { state: 'known', status: where.status };
  });

  constructor() {
    this.lock.register(this.run.state);
  }

  /** The revocation the open dialog is about. */
  current(): RevokeInput | null {
    return this.input;
  }

  /**
   * Whether the current actor may be offered to revoke this membership: an active membership that is not their own
   * (Core refuses both anyway). Neither the admin role nor the audience plays a part.
   */
  offers(membership: Membership): boolean {
    const actor = this.session.actor();
    return (
      this.available &&
      actor !== null &&
      isRevocable(membership) &&
      membership.userId !== actor.userId
    );
  }

  /** Whether the actor is an operator (the dialog says who can grant the admin role). */
  readonly byOperator = computed(() => this.session.actor()?.kind === 'operator');

  open(input: RevokeInput): void {
    if (!this.offers(input.membership) || this.lock.busy()) return;
    this.input = input;
    this.reconcileFrom.set(null);
    if (!this.run.open()) return;
    // A destructive confirmation: an alertdialog, focus on Cancel.
    const ref = this.dialogs.open(RevokeMembershipDialog, {
      data: this,
      role: 'alertdialog',
      autoFocus: 'button[data-cancel]',
    });
    ref.closed.subscribe(() => this.run.close());
  }

  /** "Check status": reload the lists (never resends). */
  checkStatus(): void {
    this.reload();
  }

  private reload(): void {
    this.reconcileFrom.set(
      this.members.whereabouts(this.input?.membership.id ?? '')?.loadSequence ?? 0,
    );
    this.scope.organizationsChanged();
  }
}
