import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, map, tap, throwError } from 'rxjs';
import { ActionFailure, failureKey } from '../../../core/actions/action-failure';
import { ActionRun } from '../../../core/actions/action-run';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { PlatformId, PlatformRef } from '../../../core/context/scope.model';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { EditPlatformDialog } from '../components/edit-platform-dialog/edit-platform-dialog';
import { PlatformCommandGateway } from '../data-access/platform-command.gateway';
import { isolated } from '../domain/create-platform.model';
import { PlatformPatch, UpdatedPlatform } from '../domain/edit-platform.model';

/** The Platform being renamed, with its name as loaded when the dialog opened (or re-read since). */
export interface EditPlatformTarget {
  readonly platformId: PlatformId;
  readonly original: string;
}

export interface EditPlatformInput {
  readonly platformId: PlatformId;
  readonly patch: PlatformPatch;
}

/** The copy of a failure. The edit has no idempotency key, so a lost answer gets its own, cautious message. */
export function editPlatformFailureKey(failure: ActionFailure): string {
  return failure.kind === 'outcomeUnknown' ? 'platforms.edit.outcomeUnknown' : failureKey(failure);
}

/**
 * "Edit name" of one Platform (M4), from its settings page (`/platforms/:platformId/settings`).
 *
 * - Offered to the Company owner only (`platform.settings.view`, mirroring Core's `canUpdatePlatform`): an operator,
 *   assigned or not, never sees it. Shown disabled, with its reason, in a build without the command.
 * - No step-up (Core: not sensitive) and no idempotency key or version: nothing is resent automatically. After a lost
 *   answer the person re-reads the current name and decides (`reloadCurrent`).
 * - The actor and the Platform are checked when it opens, before sending and on the answer (`ActionRun`).
 * - On success the hierarchy is reported changed (`ScopeContext.hierarchyChanged`), so the directory, the switcher, the
 *   breadcrumbs, the dashboard and every Platform label read the new name from the one shared record.
 */
@Injectable()
export class EditPlatformAction {
  private readonly session = inject(AuthSession);
  private readonly scope = inject(ScopeContext);
  private readonly gateway = inject(PlatformCommandGateway);
  private readonly directory = inject(ScopeDirectoryGateway);
  private readonly dialogs = inject(NwDialogService);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);

  private readonly current = signal<EditPlatformTarget | null>(null);
  readonly target = this.current.asReadonly();

  /** Whether this build can send it; otherwise it is shown disabled, with its reason. */
  readonly available = this.gateway.available;

  readonly run = new ActionRun<EditPlatformInput, UpdatedPlatform>({
    context: () => {
      const target = this.current();
      const actor = this.session.actor();
      return target !== null && actor !== null && this.mayEdit(target.platformId)
        ? { actorId: actor.userId, scope: target.platformId }
        : null;
    },
    stepUp: null,
    execute: (input) => this.gateway.update(input.platformId, input.patch),
    settled: (outcome, input, presented) => {
      if (outcome.ok) {
        this.scope.hierarchyChanged();
        this.toasts.show(
          this.transloco.translate('platforms.edit.saved', { name: isolated(outcome.result.name) }),
          { tone: 'success' },
        );
      } else if (!presented) {
        // The dialog is gone (the page was left): the result is reported where the person is now.
        const name = isolated(this.current()?.original ?? input.patch.name);
        this.toasts.show(
          `${this.transloco.translate('platforms.edit.notSaved', { name })} ${this.transloco.translate(
            editPlatformFailureKey(outcome.failure),
          )}`,
          { tone: 'danger' },
        );
      }
    },
  });

  /** The Company owner, for a Platform of their Company as the shell lists it (UX only; Core authorizes). */
  mayEdit(platform: PlatformId): boolean {
    const actor = this.session.actor();
    const platforms = this.scope.platforms();
    return (
      actor?.kind === 'owner' &&
      can(actor, 'platform.settings.view') &&
      platforms.status === 'success' &&
      platforms.data.some((p) => p.id === platform)
    );
  }

  /** Opens the dialog for the Platform shown (or the save still pending for it). */
  open(platform: PlatformRef): void {
    if (!this.available || !this.mayEdit(platform.id)) return;
    if (this.run.state().phase === 'pending') {
      // One save at a time: a detached save is shown again, and only for its own Platform.
      if (this.current()?.platformId !== platform.id || !this.run.reattach()) return;
    } else {
      this.current.set({ platformId: platform.id, original: platform.name });
      if (!this.run.open()) return;
    }
    const ref = this.dialogs.open(EditPlatformDialog, {
      data: this,
      autoFocus: 'input[name="platform-name"], button[aria-disabled="true"]',
    });
    ref.closed.subscribe(() => this.run.close());
  }

  /**
   * After a lost answer: reads the Platform's name as it is now (the Company directory), makes it the dialog's new
   * starting point and refreshes the views. Nothing is sent.
   */
  reloadCurrent(): Observable<string> {
    const target = this.current();
    const actor = this.session.actor();
    if (target === null || actor?.kind !== 'owner')
      return throwError(() => new Error('no Platform is being edited'));
    return this.directory.companyDirectory(actor.companyId).pipe(
      map((directory) => {
        const platform = directory.platforms.find((p) => p.id === target.platformId);
        if (platform === undefined) throw new Error('the Platform is no longer listed');
        return platform.name;
      }),
      tap((original) => {
        if (this.current()?.platformId !== target.platformId) return;
        this.current.set({ ...target, original });
        this.scope.hierarchyChanged();
      }),
    );
  }
}
