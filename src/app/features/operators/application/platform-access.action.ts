import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { take } from 'rxjs';
import { ActionFailure, failureKey } from '../../../core/actions/action-failure';
import { ActionContext, ActionRun } from '../../../core/actions/action-run';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway, StepUpPurpose } from '../../../core/auth/step-up.gateway';
import { ScopeContext } from '../../../core/context/scope-context';
import { PlatformId, PlatformRef } from '../../../core/context/scope.model';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { isolated } from '../../platforms/domain/create-platform.model';
import { PlatformAccessDialog } from '../components/platform-access-dialog/platform-access-dialog';
import { OperatorAssignmentGateway } from '../data-access/operator-assignment.gateway';
import { OperatorDirectoryGateway } from '../data-access/operator-directory.gateway';
import { OperatorContact, PlatformAssignment } from '../domain/operator.model';
import { OperatorDetailFacade } from './operator-detail.facade';

/** One Platform access change: give (`grant: true`) or remove, for the operator the page shows. */
export interface PlatformAccessInput {
  readonly operatorId: string;
  /** Shown in the dialog only (never in a toast, a URL or a log). */
  readonly contact: OperatorContact;
  readonly platform: PlatformRef;
  readonly grant: boolean;
}

/** Core's step-up purpose of each direction (TOTP, a passkey or the secret key are all accepted for both). */
export const accessPurposeOf = (grant: boolean): StepUpPurpose =>
  grant ? 'platform_assignment.grant' : 'platform_assignment.revoke';

/** Failures after which the assignment may have changed, or Core's view of it is unknown: the history is reloaded. */
export const accessReconciles = (failure: ActionFailure): boolean =>
  failure.kind === 'outcomeUnknown' ||
  failure.kind === 'conflict' ||
  failure.kind === 'refused' ||
  failure.kind === 'unavailable';

/** Access-specific copy where the generic one would mislead; otherwise the shared action copy. */
export function accessFailureKey(failure: ActionFailure): string {
  switch (failure.kind) {
    case 'conflict':
      return 'operators.access.failure.conflict';
    case 'refused':
      return 'operators.access.failure.refused';
    case 'outcomeUnknown':
      return 'operators.access.failure.unknown';
    case 'unavailable':
      return 'operators.access.failure.unavailable';
    case 'rateLimited':
      return 'operators.access.failure.rateLimited';
    default:
      return failureKey(failure);
  }
}

/** What a reload of the history shows after a failure: checking, could not check, or whether the Platform is active. */
export type AccessReconciliation =
  | { readonly state: 'checking' }
  | { readonly state: 'unchecked' }
  | { readonly state: 'known'; readonly assigned: boolean };

/**
 * "Give access to a Platform" / "Remove access" (P6-S2) on an operator's details, for the Company owner only (Core's
 * `POST|DELETE /auth/admin/operators/:id/platform-assignments[/:platformId]` are `@Actors('owner')`; an operator,
 * even on their own record, gets `403`, so they are never offered it). One `ActionRun` for both directions: the
 * confirmation, the owner's step-up of the direction's purpose (`platform_assignment.grant` / `.revoke`; the dialog
 * offers the authenticator code, Core also accepts a passkey or the secret key), then the change. Route-scoped with the
 * detail facade; one change at a time (the run is single-flight and every control waits while it is sent).
 *
 * - A refused verification stays in the verification step. A `409`, a `404`, a `503` or a lost answer reloads the
 *   history (never resends) and the dialog says what it shows; a match does not prove this attempt caused it. "Try
 *   again" (a new verification) only after a rate limit, a refused verification, or once the reload shows the old state.
 * - Removal warnings (the operator's only Platform; no other operator listed for it in the provisional directory) are
 *   information only: Core has no such rule.
 * - The removed operator's own Platform list in another session stays as it was until P6-S2b; Core refuses their next
 *   request on that Platform. Nothing here signs anyone out.
 */
@Injectable()
export class PlatformAccessAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly gateway = inject(OperatorAssignmentGateway);
  private readonly directory = inject(OperatorDirectoryGateway);
  private readonly stepUp = inject(StepUpGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);
  /** The page's operator and history (the dialog, outside the route's injector, reads them through the action). */
  readonly detail = inject(OperatorDetailFacade);
  private input: PlatformAccessInput | null = null;
  /** The history answer count when a reload was asked for (`null`: none asked). */
  private readonly reconcileFrom = signal<number | null>(null);

  /** Whether changes can be sent in this build. */
  readonly available = this.gateway.available;

  /**
   * For a removal: how many OTHER operators the provisional directory lists on the Platform (`null`: not known, so no
   * warning is claimed; production has no directory, CF-03).
   */
  readonly otherOperators = signal<number | null>(null);

  /** The last change that succeeded (the page moves focus to the access section). */
  readonly succeeded = signal<{ readonly platformId: PlatformId; readonly grant: boolean } | null>(
    null,
  );

  readonly run = new ActionRun<PlatformAccessInput, PlatformAssignment | void>({
    context: () => this.context(),
    stepUp: (proof) => this.stepUp.obtain(accessPurposeOf(this.input?.grant ?? true), proof),
    execute: (input, { stepUpToken }) =>
      input.grant
        ? this.gateway.grant(input.operatorId, input.platform.id, {
            stepUpToken: stepUpToken ?? '',
          })
        : this.gateway.revoke(input.operatorId, input.platform.id, {
            stepUpToken: stepUpToken ?? '',
          }),
    settled: (outcome, input, presented) => {
      const name = isolated(input.platform.name);
      if (outcome.ok) {
        // Every view that counts assignments (directories, dashboards, the Overview) and this history reload.
        this.scope.organizationsChanged();
        this.succeeded.set({ platformId: input.platform.id, grant: input.grant });
        this.toasts.show(
          this.transloco.translate(
            input.grant ? 'operators.access.granted' : 'operators.access.removed',
            { name },
          ),
          { tone: 'success' },
        );
        return;
      }
      if (accessReconciles(outcome.failure)) this.reconcile();
      if (!presented)
        this.toasts.show(
          `${this.transloco.translate('operators.access.notChanged', { name })} ${this.transloco.translate(accessFailureKey(outcome.failure))}`,
          { tone: 'danger' },
        );
    },
  });

  /** The Platform whose change is being sent, if any (its row says so; every control waits). */
  readonly sendingPlatformId = computed(() =>
    this.run.state().phase === 'pending' ? (this.input?.platform.id ?? null) : null,
  );

  /** Whether any change is under way (verification checked or change sent): every access control waits. */
  readonly busy = computed(() => {
    const state = this.run.state();
    return state.phase === 'pending' || (state.phase === 'verifying' && state.busy);
  });

  /** Where the Platform is according to a history reload asked for after the failure. */
  readonly reconciliation = computed<AccessReconciliation | null>(() => {
    const from = this.reconcileFrom();
    this.run.state();
    const platform = this.input?.platform.id ?? null;
    if (from === null || platform === null) return null;
    if (this.detail.historyView().status === 'error') return { state: 'unchecked' };
    if (this.detail.historySequence() <= from) return { state: 'checking' };
    const assigned = this.detail.isAssigned(platform);
    return assigned === null ? { state: 'checking' } : { state: 'known', assigned };
  });

  /** Whether the owner may be offered changes at all (UX: Core decides every request). */
  readonly offered = computed(
    () => this.available && can(this.session.actor(), 'operator.platformAccess.change'),
  );

  /** The change the open dialog is about. */
  current(): PlatformAccessInput | null {
    return this.input;
  }

  /**
   * Opens the dialog for one change: a grant of a Company Platform the loaded history shows unassigned, or a removal of
   * one it shows active. Nothing for anyone but the owner, or while another change is under way.
   */
  open(input: PlatformAccessInput): void {
    if (!this.offered() || this.busy()) return;
    if (this.detail.isAssigned(input.platform.id) !== !input.grant) return;
    this.input = input;
    this.reconcileFrom.set(null);
    this.otherOperators.set(null);
    if (!this.run.open()) return;
    if (!input.grant) this.countOtherOperators(input);
    // Removing interrupts: an alertdialog, focus on Cancel. Giving: a dialog, focus on the first choice.
    const ref = this.dialogs.open(PlatformAccessDialog, {
      data: this,
      role: input.grant ? 'dialog' : 'alertdialog',
      autoFocus: input.grant ? 'input[type="radio"]:checked' : 'button[data-cancel]',
    });
    ref.closed.subscribe(() => this.run.close());
  }

  /** Changes the Platform of a grant still being chosen (the dialog's radio group). */
  choose(platform: PlatformRef): void {
    if (this.input === null || !this.input.grant || this.run.state().phase !== 'editing') return;
    if (this.detail.isAssigned(platform.id) !== false) return;
    this.input = { ...this.input, platform };
  }

  /** "Check again": reload the history (never resends). */
  checkStatus(): void {
    this.reconcile();
  }

  /** The owner, in their Company; nobody else may run it. */
  private context(): ActionContext | null {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'operator.platformAccess.change')
      ? { actorId: actor.userId, scope: actor.companyId }
      : null;
  }

  private reconcile(): void {
    this.reconcileFrom.set(this.detail.historySequence());
    // Counts elsewhere may have changed too (a lost answer may have applied): every view reloads, this history in place.
    this.scope.organizationsChanged();
  }

  /** The provisional directory's other operators actively assigned to the Platform (a warning's source only). */
  private countOtherOperators(input: PlatformAccessInput): void {
    const actor = this.session.actor();
    if (actor?.kind !== 'owner') return;
    this.directory
      .list(actor.companyId)
      .pipe(take(1))
      .subscribe({
        next: (operators) => {
          if (this.input !== input) return;
          this.otherOperators.set(
            operators.filter(
              (o) => o.id !== input.operatorId && o.activePlatformIds.includes(input.platform.id),
            ).length,
          );
        },
        error: () => undefined,
      });
  }
}
