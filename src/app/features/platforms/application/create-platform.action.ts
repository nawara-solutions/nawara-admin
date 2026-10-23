import { Injectable, computed, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { ActionRun } from '../../../core/actions/action-run';
import { failureKey } from '../../../core/actions/action-failure';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { ScopeContext } from '../../../core/context/scope-context';
import { CompanyId } from '../../../core/context/scope.model';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { CreatePlatformDialog } from '../components/create-platform-dialog/create-platform-dialog';
import { PlatformCommandGateway } from '../data-access/platform-command.gateway';
import { CreatePlatformRequest, CreatedPlatform, isolated } from '../domain/create-platform.model';

/**
 * "Create platform" (owner only; P4-S1), the one flow behind every entry point (the Platform directory and the Company
 * Overview). The public facade of this action: other features use it, never its internals.
 *
 * - Shown only to the owner (`platform.create`, mirroring Core's `canCreatePlatform`); disabled with its reason when this
 *   build cannot send it (no adapter).
 * - The actor and the Company are checked when it opens, immediately before sending and on the answer (`ActionRun`).
 * - It requires the owner's step-up for the documented purpose `platform.create`, obtained right before sending.
 * - On success the hierarchy is reported changed (`ScopeContext.hierarchyChanged`), so the directory, the overview, the
 *   switcher and the sidebar all show the new Platform; the person is told by a toast, wherever they are by then.
 */
@Injectable()
export class CreatePlatformAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly gateway = inject(PlatformCommandGateway);
  private readonly stepUp = inject(StepUpGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);

  /** Whether the action is offered at all (the owner); an operator never sees it. */
  readonly visible = computed(() => can(this.session.actor(), 'platform.create'));
  /** Whether this build can send it; otherwise it is shown disabled, with its reason. */
  readonly available = this.gateway.available;
  readonly run = new ActionRun<CreatePlatformRequest, CreatedPlatform>({
    context: () => {
      const actor = this.session.actor();
      return actor?.kind === 'owner' && can(actor, 'platform.create')
        ? { actorId: actor.userId, scope: actor.companyId }
        : null;
    },
    stepUp: (proof) => this.stepUp.obtain('platform.create', proof),
    execute: (request, { idempotencyKey, stepUpToken }) =>
      this.gateway.create(request, { idempotencyKey, stepUpToken: stepUpToken ?? '' }),
    settled: (outcome, request, presented) => {
      if (outcome.ok) {
        this.scope.hierarchyChanged();
        this.toasts.show(
          this.transloco.translate('platforms.create.created', {
            name: isolated(outcome.result.platform.name),
          }),
          { tone: 'success' },
        );
      } else if (!presented) {
        // The dialog is gone (the page was left): the result is reported where the person is now.
        this.toasts.show(
          `${this.transloco.translate('platforms.create.notCreated', { name: isolated(request.name.trim()) })} ${this.transloco.translate(
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

  /** The Company the request is for (the owner's); `null` for anyone else. */
  companyId(): CompanyId | null {
    const actor = this.session.actor();
    return actor?.kind === 'owner' ? actor.companyId : null;
  }

  /** Opens the dialog (or shows the one still pending). Nothing happens for an actor who may not create Platforms. */
  open(): void {
    if (!this.visible() || !this.available) return;
    if (!this.run.reattach() && !this.run.open()) return;
    // Focus starts in the name field (P4 design, artboard 10), never on the close button.
    const ref = this.dialogs.open(CreatePlatformDialog, {
      data: this,
      autoFocus: 'input[name="platform-name"], button[aria-disabled="true"]',
    });
    ref.closed.subscribe(() => this.run.close());
  }
}
