import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { defer, throwError } from 'rxjs';
import { ActionRun } from '../../../core/actions/action-run';
import { failureKey } from '../../../core/actions/action-failure';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { PlatformAccess, platformAccessOf } from '../../../core/context/platform-access';
import { ScopeContext, organizationPath } from '../../../core/context/scope-context';
import { PlatformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { isolated } from '../../platforms/domain/create-platform.model';
import { CreateOrganizationDialog } from '../components/create-organization-dialog/create-organization-dialog';
import { OrganizationCommandGateway } from '../data-access/organization-command.gateway';
import {
  CreateOrganizationRequest,
  CreatedOrganization,
} from '../domain/create-organization.model';

/** Why the action is offered but cannot be used (catalog keys); `null` when it can. */
export type CreateOrganizationBlocked = 'operator' | 'notInBuild' | null;

const BLOCKED_KEYS = {
  operator: 'organizations.create.operatorReason',
  notInBuild: 'organizations.create.notInBuildReason',
} as const satisfies Record<Exclude<CreateOrganizationBlocked, null>, string>;

/**
 * "Create organization" under the Platform in the URL (P3b-S1), behind the directory's header and its empty state.
 *
 * - Offered to whoever may enter the Platform (the owner, an assigned operator). Core authorizes both
 *   (`canCreateOrganization`), but only the owner has a step-up for `organization.create`: an operator sees the action
 *   disabled with that reason (CF-08), as does anyone when this build cannot send it (no adapter).
 * - The actor and the Company are checked when it opens, immediately before sending and on the answer (`ActionRun`);
 *   the parent Platform must still be one of the actor's Platforms before anything is sent.
 * - The Platform id comes from the URL once its access is granted; it is never typed.
 * - On success the views that follow `ScopeContext.revision` reload (the directory, the dashboard, the overview);
 *   while the dialog is still open the person is taken to the new Organization, and told by a toast either way.
 */
@Injectable()
export class CreateOrganizationAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly router = inject(Router);
  private readonly gateway = inject(OrganizationCommandGateway);
  private readonly stepUp = inject(StepUpGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);

  private readonly access = computed<PlatformAccess>(() =>
    platformAccessOf(this.scope.scope(), this.scope.platforms(), this.session.actor()),
  );

  /** The Platform in the URL, once the actor may enter it; `null` otherwise. */
  readonly platform = computed(() => {
    const access = this.access();
    return access.status === 'granted' ? access.platform : null;
  });

  /** Whether the action is shown at all: on a Platform the actor may enter. */
  readonly visible = computed(() => this.platform() !== null);

  readonly blocked = computed<CreateOrganizationBlocked>(() => {
    if (!can(this.session.actor(), 'organization.create')) return 'operator';
    return this.gateway.available ? null : 'notInBuild';
  });

  readonly blockedKey = computed(() => {
    const blocked = this.blocked();
    return blocked === null ? null : BLOCKED_KEYS[blocked];
  });

  readonly run = new ActionRun<CreateOrganizationRequest, CreatedOrganization>({
    context: () => {
      const actor = this.session.actor();
      return actor?.kind === 'owner' && can(actor, 'organization.create')
        ? { actorId: actor.userId, scope: actor.companyId }
        : null;
    },
    stepUp: (proof) => this.stepUp.obtain('organization.create', proof),
    // Immediately before sending, the parent Platform must still be one of the actor's (it may have been removed):
    // otherwise nothing is sent and the action is refused, tenant-safe (no detail).
    execute: (request, { idempotencyKey, stepUpToken }) =>
      defer(() =>
        this.isOwnPlatform(request.platformId)
          ? this.gateway.create(request, { idempotencyKey, stepUpToken: stepUpToken ?? '' })
          : throwError((): AppError => ({ kind: 'not_found', status: 404 })),
      ),
    settled: (outcome, request, presented) => {
      if (outcome.ok) {
        const { organization } = outcome.result;
        this.scope.organizationsChanged();
        this.toasts.show(
          this.transloco.translate('organizations.create.created', {
            name: isolated(organization.name),
          }),
          { tone: 'success' },
        );
        if (presented)
          void this.router.navigateByUrl(
            organizationPath(organization.platformId, organization.id),
          );
      } else if (!presented) {
        // The dialog is gone (the page was left): the result is reported where the person is now.
        this.toasts.show(
          `${this.transloco.translate('organizations.create.notCreated', { name: isolated(request.name) })} ${this.transloco.translate(
            failureKey(outcome.failure),
            {
              seconds:
                outcome.failure.kind === 'rateLimited'
                  ? outcome.failure.retryAfterSeconds
                  : undefined,
            },
          )}`,
          { tone: 'danger' },
        );
      }
    },
  });

  /** Opens the dialog (or shows the one still pending). Nothing happens when the action cannot be used. */
  open(): void {
    if (!this.visible() || this.blocked() !== null) return;
    if (!this.run.reattach() && !this.run.open()) return;
    // Focus starts in the name field (P3b design), never on the close button.
    const ref = this.dialogs.open(CreateOrganizationDialog, {
      data: this,
      autoFocus: 'input[name="organization-name"], button[aria-disabled="true"]',
    });
    ref.closed.subscribe(() => this.run.close());
  }

  private isOwnPlatform(platform: PlatformId): boolean {
    const platforms = this.scope.platforms();
    return platforms.status === 'success' && platforms.data.some((p) => p.id === platform);
  }
}
