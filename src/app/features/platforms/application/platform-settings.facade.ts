import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { PlatformAccess, platformAccessOf } from '../../../core/context/platform-access';
import { ScopeContext } from '../../../core/context/scope-context';
import { PlatformId } from '../../../core/context/scope.model';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { PlatformCommercialGateway } from '../../platform-dashboard/data-access/platform-commercial.gateway';
import { PlatformCommercial } from '../../platform-dashboard/domain/platform-commercial.model';

const IDLE = { status: 'idle' } as const;

/**
 * View state of a Platform's settings (`/platforms/:platformId/settings`, M4; docs/design/p9-settings-architecture.md
 * §6), scoped to the route.
 *
 * - The Platform comes from the URL and the actor's Platforms (`platformAccessOf`), so its identity (name, key,
 *   product) is the one shared record the switcher, breadcrumbs and directory read: a rename shows here as everywhere.
 * - Owner only (`platform.settings.view`): an operator, even one assigned to the Platform, gets the same "not found or
 *   not accessible" state as an unknown Platform (Core's collapsed answer); nothing about it is requested.
 * - Assisted payments come from the Platform's commercial read (owner only), shown read only.
 */
@Injectable()
export class PlatformSettingsFacade {
  private readonly context = inject(ScopeContext);
  private readonly session = inject(AuthSession);
  private readonly commercialGateway = inject(PlatformCommercialGateway);
  private readonly reloads = new Subject<void>();

  readonly access = computed<PlatformAccess>(() => {
    const access = platformAccessOf(
      this.context.scope(),
      this.context.platforms(),
      this.session.actor(),
    );
    return access.status === 'granted' && !can(this.session.actor(), 'platform.settings.view')
      ? { status: 'notAccessible' }
      : access;
  });

  private readonly platformId = computed<PlatformId | null>(() => {
    const access = this.access();
    return access.status === 'granted' && can(this.session.actor(), 'platform.commercial.view')
      ? access.platform.id
      : null;
  });

  private readonly commercialRaw = toSignal(
    combineLatest([
      toObservable(this.platformId),
      toObservable(this.context.revision),
      this.reloads.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([id]) =>
        id === null
          ? of<ViewState<PlatformCommercial>>(IDLE)
          : toViewState(this.commercialGateway.load(id)),
      ),
    ),
    { initialValue: IDLE as ViewState<PlatformCommercial> },
  );

  /** The commercial read of the Platform in the URL; an answer for another Platform reads as loading. */
  readonly commercial = computed<ViewState<PlatformCommercial>>(() => {
    const state = this.commercialRaw();
    const id = this.platformId();
    if (id === null) return IDLE;
    return state.status === 'success' && state.data.platformId !== id
      ? { status: 'loading' }
      : state;
  });

  /** "Try again": the commercial read, or (when the Platforms could not be listed) the scope directory. */
  reload(): void {
    if (this.access().status === 'directoryUnavailable') this.context.reload();
    else this.reloads.next();
  }
}
