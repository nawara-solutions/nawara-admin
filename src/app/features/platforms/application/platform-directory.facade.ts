import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { PlatformDirectoryGateway } from '../data-access/platform-directory.gateway';
import { PlatformDirectoryEntry } from '../domain/platform-directory.model';

/**
 * View state and commands of the Platform directory (docs/ARCHITECTURE.md §5). Scoped to the feature route.
 * Only an owner has a Company scope: for any other actor the facade calls no gateway and reports `forbidden` (UX; Core
 * is the authority). A Company without Platforms is `empty`. Reloading cancels the previous request (`switchMap`).
 */
@Injectable()
export class PlatformDirectoryFacade {
  private readonly gateway = inject(PlatformDirectoryGateway);
  private readonly session = inject(AuthSession);
  private readonly reloads = new Subject<void>();

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'company.platforms.view') ? actor.companyId : null;
  });

  readonly state = toSignal(
    combineLatest([toObservable(this.companyId), this.reloads.pipe(startWith(undefined))]).pipe(
      switchMap(([id]) =>
        id === null
          ? of<ViewState<readonly PlatformDirectoryEntry[]>>({ status: 'forbidden' })
          : toViewState(this.gateway.list(id), (entries) => entries.length === 0),
      ),
    ),
    { initialValue: { status: 'idle' } as ViewState<readonly PlatformDirectoryEntry[]> },
  );

  /** Whether Create platform is shown at all (owner only, as Core's `canCreatePlatform`). */
  readonly canSeeCreatePlatform = computed(() => can(this.session.actor(), 'platform.create'));

  reload(): void {
    this.reloads.next();
  }
}
