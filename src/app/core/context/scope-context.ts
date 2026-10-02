import { Injectable, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, of, shareReplay, startWith, switchMap } from 'rxjs';
import { AuthSession } from '../auth/auth-session';
import { ViewState, toViewState } from '../state/view-state';
import { ScopeDirectoryGateway } from './scope-directory.gateway';
import { AdminScope, CompanyDirectory, PlatformId, platformId } from './scope.model';

/** Route prefix of the platform scope (docs/ARCHITECTURE.md §6, §7). */
export const PLATFORM_SCOPE_SEGMENT = 'platforms';

/** The platform-scope URL of a Platform (docs/ARCHITECTURE.md §6). */
export const platformPath = (platform: PlatformId): string =>
  `/${PLATFORM_SCOPE_SEGMENT}/${encodeURIComponent(platform)}`;

/** The scope a URL addresses: `/platforms/:platformId/…` is platform scope; everything else in the shell is company scope. */
export function scopeFromUrl(url: string): AdminScope {
  const path = url.split(/[?#]/)[0] ?? '';
  const [first, id] = path.split('/').filter((segment) => segment !== '');
  if (first === PLATFORM_SCOPE_SEGMENT && id) {
    return { kind: 'platform', platformId: platformId(decodeURIComponent(id)) };
  }
  return { kind: 'company' };
}

/**
 * The current administrative scope and the Company directory behind the context switcher (docs/ARCHITECTURE.md §7).
 * The URL is the source of truth, so refresh and deep links rebuild the scope. Provided by the shell route, where the
 * directory gateway is bound. Only an owner has a Company directory; an operator's scope is their assignments.
 */
@Injectable()
export class ScopeContext {
  private readonly router = inject(Router);
  private readonly gateway = inject(ScopeDirectoryGateway);
  private readonly session = inject(AuthSession);

  readonly scope = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => scopeFromUrl(event.urlAfterRedirects)),
      startWith(scopeFromUrl(this.router.url)),
    ),
    { requireSync: true },
  );

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' ? actor.companyId : null;
  });

  /** One load per Company, shared by the switcher, breadcrumbs and pages. */
  readonly directory$ = toObservable(this.companyId).pipe(
    switchMap((id) =>
      id === null
        ? of<ViewState<CompanyDirectory>>({ status: 'forbidden' })
        : toViewState(this.gateway.companyDirectory(id)),
    ),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly directory = toSignal(this.directory$, {
    initialValue: { status: 'idle' } as ViewState<CompanyDirectory>,
  });
}
