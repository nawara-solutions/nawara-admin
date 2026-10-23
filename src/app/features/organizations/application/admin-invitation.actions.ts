import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, defer, throwError } from 'rxjs';
import { ActionFailure, failureKey } from '../../../core/actions/action-failure';
import { ActionRun } from '../../../core/actions/action-run';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { ScopeContext } from '../../../core/context/scope-context';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { isolated } from '../../platforms/domain/create-platform.model';
import { CreateAdminInvitationDialog } from '../components/create-admin-invitation-dialog/create-admin-invitation-dialog';
import { RevokeAdminInvitationDialog } from '../components/revoke-admin-invitation-dialog/revoke-admin-invitation-dialog';
import { AdminInvitationGateway } from '../data-access/admin-invitation.gateway';
import {
  AdminInvitation,
  CreateAdminInvitationRequest,
  CreateAttempt,
  CreatedAdminInvitation,
} from '../domain/admin-invitation.model';
import { AdminInvitationsFacade } from './admin-invitations.facade';

/** The Organization an invitation action is for, as shown on the detail page. */
export interface InvitationTarget {
  readonly organizationId: OrganizationId;
  readonly organizationName: string;
  readonly platformId: PlatformId;
}

/** Invitation-specific copy where the generic one would mislead; otherwise the shared action copy. */
export function invitationFailureKey(failure: ActionFailure, action: 'create' | 'revoke'): string {
  if (failure.kind === 'outcomeUnknown')
    return action === 'create'
      ? 'organizations.invitations.failure.createUnknown'
      : 'organizations.invitations.failure.revokeUnknown';
  if (failure.kind === 'refused')
    return action === 'create'
      ? 'organizations.invitations.failure.createRefused'
      : 'organizations.invitations.failure.revokeRefused';
  if (failure.kind === 'conflict') return 'organizations.invitations.failure.collision';
  if (failure.kind === 'rateLimited') return 'organizations.invitations.failure.rateLimited';
  return failureKey(failure);
}

/** Shared by both actions: the owner, in their Company, acting on an Organization of one of their Platforms. */
abstract class InvitationAction {
  protected readonly session = inject(AuthSession);
  protected readonly scope = inject(ScopeContext);
  protected readonly gateway = inject(AdminInvitationGateway);
  protected readonly stepUp = inject(StepUpGateway);
  protected readonly facade = inject(AdminInvitationsFacade);
  protected readonly dialogs = inject(NwDialogService);
  protected readonly toasts = inject(NwToastService);
  protected readonly transloco = inject(TranslocoService);

  readonly available = this.gateway.available;

  protected context() {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'platform.access.view')
      ? { actorId: actor.userId, scope: actor.companyId }
      : null;
  }

  /** Immediately before sending: the Organization's Platform is still one of the actor's; otherwise nothing is sent. */
  protected guarded<T>(platform: PlatformId, send: () => Observable<T>): Observable<T> {
    return defer(() => {
      const platforms = this.scope.platforms();
      return platforms.status === 'success' && platforms.data.some((p) => p.id === platform)
        ? send()
        : throwError((): AppError => ({ kind: 'not_found', status: 404 }));
    });
  }

  protected failureText(failure: ActionFailure, action: 'create' | 'revoke'): string {
    return this.transloco.translate(invitationFailureKey(failure, action));
  }
}

export interface CreateInvitationInput {
  readonly target: InvitationTarget;
  readonly request: CreateAdminInvitationRequest;
}

/**
 * "Create invitation" (P3b-S3): the owner's step-up for `admin_invitation.create`, then Core's create, which answers
 * the one-time code. No idempotency key exists, so nothing is ever resent automatically. The code goes to the open
 * dialog only (the run's result); nothing here keeps, logs or toasts it.
 */
@Injectable()
export class CreateAdminInvitationAction extends InvitationAction {
  private readonly now = inject(NW_CLOCK);
  private attempt: CreateAttempt | null = null;
  private target: InvitationTarget | null = null;

  readonly run = new ActionRun<CreateInvitationInput, CreatedAdminInvitation>({
    context: () => this.context(),
    stepUp: (proof) => this.stepUp.obtain('admin_invitation.create', proof),
    execute: (input, { stepUpToken }) =>
      this.guarded(input.target.platformId, () => {
        const userId = this.session.actor()?.userId ?? '';
        this.attempt = { knownIds: this.facade.knownIds(), sentAt: this.now(), userId };
        return this.gateway.create(input.target.organizationId, input.request, {
          stepUpToken: stepUpToken ?? '',
        });
      }),
    settled: (outcome, input, presented) => {
      if (outcome.ok) {
        this.scope.organizationsChanged();
        // The dialog shows the code; with the dialog gone, it is lost for good, and the toast never carries it.
        if (!presented)
          this.toasts.show(this.transloco.translate('organizations.invitations.createdUnseen'), {
            tone: 'warning',
            duration: null,
          });
        return;
      }
      if (outcome.failure.kind === 'outcomeUnknown' && this.attempt !== null) {
        this.facade.markUncertain(this.attempt);
        this.scope.organizationsChanged();
      }
      if (!presented)
        this.toasts.show(
          `${this.transloco.translate('organizations.invitations.notCreated', {
            name: isolated(input.target.organizationName),
          })} ${this.failureText(outcome.failure, 'create')}`,
          { tone: 'danger' },
        );
    },
  });

  /** The Organization the open dialog is for. */
  currentTarget(): InvitationTarget | null {
    return this.target;
  }

  open(target: InvitationTarget): void {
    if (!this.facade.shown() || !this.available) return;
    if (this.run.state().phase === 'pending') {
      if (this.target?.organizationId !== target.organizationId || !this.run.reattach()) return;
    } else {
      this.target = target;
      if (!this.run.open()) return;
    }
    const ref = this.dialogs.open(CreateAdminInvitationDialog, {
      data: this,
      autoFocus: 'input[name="invitation-type"], button[aria-disabled="true"]',
    });
    ref.closed.subscribe(() => this.run.close());
  }
}

export interface RevokeInvitationInput {
  readonly target: InvitationTarget;
  readonly invitation: AdminInvitation;
}

/**
 * "Revoke" (P3b-S3), the first destructive action: a confirmation, then the owner's step-up for
 * `admin_invitation.revoke`, then Core's revoke (`204`). Nothing to revoke (used, revoked, unknown) is one `404`.
 * Not idempotent and no key: after a lost answer the list is reloaded, never resent.
 */
@Injectable()
export class RevokeAdminInvitationAction extends InvitationAction {
  private input: RevokeInvitationInput | null = null;

  readonly run = new ActionRun<RevokeInvitationInput, void>({
    context: () => this.context(),
    stepUp: (proof) => this.stepUp.obtain('admin_invitation.revoke', proof),
    execute: (input, { stepUpToken }) =>
      this.guarded(input.target.platformId, () =>
        this.gateway.revoke(input.target.organizationId, input.invitation.id, {
          stepUpToken: stepUpToken ?? '',
        }),
      ),
    settled: (outcome, input, presented) => {
      if (outcome.ok) {
        this.scope.organizationsChanged();
        this.facade.requestFocus();
        this.toasts.show(this.transloco.translate('organizations.invitations.revoked'), {
          tone: 'success',
        });
        return;
      }
      // Whatever happened, the list shows the truth: reload it (a lost answer may have revoked it).
      if (outcome.failure.kind === 'outcomeUnknown' || outcome.failure.kind === 'refused')
        this.scope.organizationsChanged();
      if (!presented)
        this.toasts.show(
          `${this.transloco.translate('organizations.invitations.notRevoked', {
            name: isolated(input.target.organizationName),
          })} ${this.failureText(outcome.failure, 'revoke')}`,
          { tone: 'danger' },
        );
    },
  });

  /** The invitation the open dialog is about. */
  current(): RevokeInvitationInput | null {
    return this.input;
  }

  open(input: RevokeInvitationInput): void {
    if (!this.facade.shown() || !this.available || input.invitation.status !== 'active') return;
    if (this.run.state().phase === 'pending') return;
    this.input = input;
    if (!this.run.open()) return;
    // A destructive confirmation: an alertdialog, focus on Cancel.
    const ref = this.dialogs.open(RevokeAdminInvitationDialog, {
      data: this,
      role: 'alertdialog',
      autoFocus: 'button[data-cancel]',
    });
    ref.closed.subscribe(() => this.run.close());
  }
}
