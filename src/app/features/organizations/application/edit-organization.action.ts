import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, map, tap } from 'rxjs';
import { ActionFailure, failureKey } from '../../../core/actions/action-failure';
import { ActionRun } from '../../../core/actions/action-run';
import { canEnterPlatform } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { isolated } from '../../platforms/domain/create-platform.model';
import { EditOrganizationDialog } from '../components/edit-organization-dialog/edit-organization-dialog';
import { OrganizationCommandGateway } from '../data-access/organization-command.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import {
  OrganizationPatch,
  OrganizationValues,
  UpdatedOrganization,
} from '../domain/edit-organization.model';
import { OrganizationDetail } from '../domain/organization.model';

/** The Organization being edited, as loaded when the dialog opened (or reloaded since). */
export interface EditTarget {
  readonly organizationId: OrganizationId;
  readonly platformId: PlatformId;
  readonly original: OrganizationValues;
}

export interface EditOrganizationInput {
  readonly organizationId: OrganizationId;
  readonly patch: OrganizationPatch;
}

/** The copy of a failure. An edit has no idempotency key, so a lost answer gets its own, cautious message. */
export function editFailureKey(failure: ActionFailure): string {
  return failure.kind === 'outcomeUnknown'
    ? 'organizations.edit.outcomeUnknown'
    : failureKey(failure);
}

/**
 * "Edit details" of one Organization (P3b-S2), from the About card of its detail page.
 *
 * - Offered to whoever may act on the Organization's Platform: the owner of its Company, or an operator assigned to
 *   it (Core authorizes both; no step-up). Shown disabled, with its reason, in a build without the command.
 * - The context is the actor and the Organization's Platform, checked against the actor's Platforms (not the URL)
 *   when it opens, before sending and on the answer: a result still reaches the person after they leave the page, and
 *   never another actor (`ActionRun`).
 * - Sends only the changed fields (`patchFrom`). No idempotency key and no concurrency token exist, so nothing is ever
 *   resent automatically: after a lost answer the person reloads the current details and decides (`reloadCurrent`).
 * - On success the views that follow `ScopeContext.revision` reload (the detail and its breadcrumb, the directory, the
 *   dashboard, the overview), and a toast says so.
 */
@Injectable()
export class EditOrganizationAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly gateway = inject(OrganizationCommandGateway);
  private readonly organizations = inject(OrganizationGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);

  private readonly current = signal<EditTarget | null>(null);
  readonly target = this.current.asReadonly();

  /** Whether this build can send it; otherwise it is shown disabled, with its reason. */
  readonly available = this.gateway.available;

  readonly run = new ActionRun<EditOrganizationInput, UpdatedOrganization>({
    context: () => {
      const target = this.current();
      const actor = this.session.actor();
      return target !== null && actor !== null && this.mayEdit(target.platformId)
        ? { actorId: actor.userId, scope: target.platformId }
        : null;
    },
    stepUp: null,
    execute: (input) => this.gateway.update(input.organizationId, input.patch),
    settled: (outcome, _input, presented) => {
      if (outcome.ok) {
        this.scope.organizationsChanged();
        this.toasts.show(
          this.transloco.translate('organizations.edit.saved', {
            name: isolated(outcome.result.name),
          }),
          { tone: 'success' },
        );
      } else if (!presented) {
        // The dialog is gone (the page was left): the result is reported where the person is now.
        const name = isolated(this.current()?.original.name ?? '');
        this.toasts.show(
          `${this.transloco.translate('organizations.edit.notSaved', { name })} ${this.transloco.translate(
            editFailureKey(outcome.failure),
          )}`,
          { tone: 'danger' },
        );
      }
    },
  });

  /** Whether the actor may act on this Platform: the owner of its Company, or an operator assigned to it (UX only). */
  mayEdit(platform: PlatformId): boolean {
    const actor = this.session.actor();
    const platforms = this.scope.platforms();
    if (actor === null || platforms.status !== 'success') return false;
    return canEnterPlatform(
      actor,
      platform,
      platforms.data.map((p) => p.id),
    );
  }

  /** Opens the dialog for the Organization shown (or the save still pending for it). */
  open(detail: OrganizationDetail): void {
    if (!this.available || !this.mayEdit(detail.platformId)) return;
    const pending = this.run.state().phase === 'pending';
    if (pending) {
      // One save at a time: a detached save is shown again, and only for its own Organization.
      if (this.current()?.organizationId !== detail.id || !this.run.reattach()) return;
    } else {
      this.current.set({
        organizationId: detail.id,
        platformId: detail.platformId,
        original: { name: detail.name, ...detail.metadata },
      });
      if (!this.run.open()) return;
    }
    // Focus starts in the name field (P3b-S2 design), never on the close button.
    const ref = this.dialogs.open(EditOrganizationDialog, {
      data: this,
      autoFocus: 'input[name="organization-name"], button[aria-disabled="true"]',
    });
    ref.closed.subscribe(() => this.run.close());
  }

  /**
   * After a lost answer: loads the Organization as it is now, makes it the dialog's new starting point (so the change
   * marks and the patch compare against it) and refreshes the views. Nothing is sent.
   */
  reloadCurrent(): Observable<OrganizationValues> {
    const target = this.current();
    if (target === null) throw new Error('no Organization is being edited');
    return this.organizations.load(target.organizationId).pipe(
      map((detail): OrganizationValues => ({ name: detail.name, ...detail.metadata })),
      tap((original) => {
        if (this.current()?.organizationId !== target.organizationId) return;
        this.current.set({ ...target, original });
        this.scope.organizationsChanged();
      }),
    );
  }
}
