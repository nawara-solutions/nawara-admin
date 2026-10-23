import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ActionFailure, failureKey } from '../../../core/actions/action-failure';
import { ActionRun } from '../../../core/actions/action-run';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { isolated } from '../../platforms/domain/create-platform.model';
import { MembershipDecisionDialog } from '../components/membership-decision-dialog/membership-decision-dialog';
import { MembershipGateway } from '../data-access/membership.gateway';
import {
  MembershipDecision,
  MembershipDecisionResult,
  isDecidable,
} from '../domain/membership-decision.model';
import { ListableMembershipStatus, Membership } from '../domain/membership.model';
import {
  MembershipActionLock,
  MembershipActionTarget,
  guardedByPlatform,
  membershipActionContext,
} from './membership-action-support';
import { OrganizationMembersFacade } from './organization-members.facade';

/** The Organization a decision is for, as the members page shows it (already checked against the Platform in the URL). */
export type DecisionTarget = MembershipActionTarget;

export interface DecisionInput {
  readonly target: DecisionTarget;
  /** The request as it was listed when the person chose to decide (shown in the confirmation). */
  readonly membership: Membership;
  readonly decision: MembershipDecision;
}

/** Decision-specific copy where the generic one would mislead; otherwise the shared action copy. */
export function decisionFailureKey(failure: ActionFailure): string {
  switch (failure.kind) {
    case 'conflict':
      return failure.code === 'contact_not_verified'
        ? 'organizations.members.decision.failure.contactNotVerified'
        : 'organizations.members.decision.failure.alreadyDecided';
    case 'refused':
      return 'organizations.members.decision.failure.refused';
    case 'outcomeUnknown':
      return 'organizations.members.decision.failure.unknown';
    case 'rateLimited':
      return 'organizations.members.decision.failure.rateLimited';
    case 'unavailable':
      return 'organizations.members.decision.failure.unavailable';
    default:
      return failureKey(failure);
  }
}

/** Failures after which the request may have changed: the lists are reloaded and its current status shown. */
export const reconciles = (failure: ActionFailure): boolean =>
  failure.kind === 'outcomeUnknown' ||
  failure.kind === 'refused' ||
  (failure.kind === 'conflict' && failure.code !== 'contact_not_verified');

/** What a reload shows about a request after an uncertain or refused decision. */
export type Reconciliation =
  | { readonly state: 'checking' }
  | { readonly state: 'known'; readonly status: ListableMembershipStatus | null };

/**
 * "Approve" and "Reject" a pending membership request (P5-S2), for the Company owner and an operator assigned to the
 * Organization's Platform (Core's `organizationAuthority`; Core decides, this only offers). No step-up (Core requires
 * none), no idempotency key (Core has none), no body. Route-scoped with the members facade.
 *
 * - One membership action at a time on the page (`MembershipActionLock`): every decision and revocation control waits
 *   while one is sent.
 * - Immediately before sending, the Platform must still be one of the actor's; otherwise nothing is sent (`404`).
 * - A lost answer is never resent: the lists are reloaded and the dialog shows where the request is now. A competing
 *   decision (`409`) or a request no longer available (`404`) reloads them too. "Try again" exists only where Core
 *   refused before applying anything (`429`, `503`) or once the reload shows the request still pending.
 * - Success reloads every view that follows `ScopeContext.revision` (lists, the Organization's figures, the directory,
 *   the Platform dashboard, the Company overview). Toasts name the Organization, never the member.
 */
@Injectable()
export class MembershipDecisionAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly gateway = inject(MembershipGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly lock = inject(MembershipActionLock);
  /** The page's lists (the dialog, outside the route's injector, reads them through the action). */
  readonly members = inject(OrganizationMembersFacade);
  private input: DecisionInput | null = null;
  /** The lists' answer number when a reload was asked for (`null`: none asked). */
  private readonly reconcileFrom = signal<number | null>(null);

  /** Whether decisions can be sent in this build. */
  readonly available = this.gateway.available;

  /** The membership whose decision succeeded last (the page moves focus once it has left the list). */
  readonly succeeded = signal<{ readonly membershipId: string } | null>(null);

  readonly run = new ActionRun<DecisionInput, MembershipDecisionResult>({
    context: () => membershipActionContext(this.session.actor()),
    stepUp: null,
    execute: (input) =>
      guardedByPlatform(this.scope, input.target.platformId, () =>
        this.gateway.decide(input.target.organizationId, input.membership.id, input.decision),
      ),
    settled: (outcome, input, presented) => {
      if (outcome.ok) {
        this.scope.organizationsChanged();
        this.succeeded.set({ membershipId: input.membership.id });
        this.toasts.show(
          this.transloco.translate(
            input.decision === 'approve'
              ? 'organizations.members.decision.approved'
              : 'organizations.members.decision.rejected',
            { name: isolated(input.target.organizationName) },
          ),
          { tone: 'success' },
        );
        return;
      }
      if (reconciles(outcome.failure)) this.reload();
      if (!presented)
        this.toasts.show(
          `${this.transloco.translate('organizations.members.decision.notDecided', {
            name: isolated(input.target.organizationName),
          })} ${this.transloco.translate(decisionFailureKey(outcome.failure))}`,
          { tone: 'danger' },
        );
    },
  });

  /** The membership whose decision is being sent, if any (its row shows it). */
  readonly sendingId = computed(() =>
    this.run.state().phase === 'pending' ? (this.input?.membership.id ?? null) : null,
  );

  /** Whether any membership action of the page is under way (every membership control waits). */
  readonly sending = this.lock.busy;

  constructor() {
    this.lock.register(this.run.state);
  }

  /** Where the request is according to a reload asked for after the failure (`null`: none asked). */
  readonly reconciliation = computed<Reconciliation | null>(() => {
    const from = this.reconcileFrom();
    const membershipId = this.sendingOrCurrentId();
    if (from === null || membershipId === null) return null;
    const where = this.members.whereabouts(membershipId);
    return where === null || where.loadSequence <= from
      ? { state: 'checking' }
      : { state: 'known', status: where.status };
  });

  /** The decision the open dialog is about. */
  current(): DecisionInput | null {
    return this.input;
  }

  /**
   * Whether the current actor may be offered a decision on this membership: a pending request that is not their own
   * (Core refuses both anyway). The audience plays no part.
   */
  offers(membership: Membership): boolean {
    const actor = this.session.actor();
    return (
      this.available &&
      actor !== null &&
      isDecidable(membership) &&
      membership.userId !== actor.userId
    );
  }

  open(input: DecisionInput): void {
    if (!this.offers(input.membership) || this.lock.busy()) return;
    this.input = input;
    this.reconcileFrom.set(null);
    if (!this.run.open()) return;
    // Reject closes the request: an alertdialog, focus on Cancel. Approve: a dialog, focus on its confirmation.
    const ref = this.dialogs.open(MembershipDecisionDialog, {
      data: this,
      role: input.decision === 'reject' ? 'alertdialog' : 'dialog',
      autoFocus: input.decision === 'reject' ? 'button[data-cancel]' : 'button[data-confirm]',
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

  private sendingOrCurrentId(): string | null {
    // Read the run state so a new decision recomputes this.
    this.run.state();
    return this.input?.membership.id ?? null;
  }
}
