import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { Subject, combineLatest, filter, map, of, shareReplay, startWith, switchMap } from 'rxjs';
import { AuthSession } from '../auth/auth-session';
import { ViewState, toViewState } from '../state/view-state';
import { ScopeDirectoryGateway } from './scope-directory.gateway';
import {
  AdminScope,
  CompanyDirectory,
  OrganizationId,
  PlatformId,
  PlatformRef,
  organizationId,
  platformId,
} from './scope.model';

/** Route prefix of the platform scope (docs/ARCHITECTURE.md §6, §7). */
export const PLATFORM_SCOPE_SEGMENT = 'platforms';

/** The platform-scope URL of a Platform (docs/ARCHITECTURE.md §6). */
export const platformPath = (platform: PlatformId): string =>
  `/${PLATFORM_SCOPE_SEGMENT}/${encodeURIComponent(platform)}`;

/** Below a Platform: its Organizations (an entity of platform scope, never a scope of its own; docs/ARCHITECTURE.md §7). */
export const ORGANIZATIONS_SEGMENT = 'organizations';

export const organizationsPath = (platform: PlatformId): string =>
  `${platformPath(platform)}/${ORGANIZATIONS_SEGMENT}`;

export const organizationPath = (platform: PlatformId, organization: OrganizationId): string =>
  `${organizationsPath(platform)}/${encodeURIComponent(organization)}`;

export const MEMBERS_SEGMENT = 'members';

/** An Organization's members (P5-S1): still platform scope, the Organization an entity of the URL. */
export const membersPath = (platform: PlatformId, organization: OrganizationId): string =>
  `${organizationPath(platform, organization)}/${MEMBERS_SEGMENT}`;

/** One membership, resolved from the Organization's lists (Core has no single-membership read). */
export const membershipPath = (
  platform: PlatformId,
  organization: OrganizationId,
  membership: string,
): string => `${membersPath(platform, organization)}/${encodeURIComponent(membership)}`;

/** Where in platform scope a URL is: the dashboard, the Organization directory, or one Organization. */
export type PlatformPage =
  | { readonly kind: 'dashboard' }
  | { readonly kind: 'organizations' }
  | { readonly kind: 'organization'; readonly organizationId: OrganizationId }
  | { readonly kind: 'members'; readonly organizationId: OrganizationId }
  | {
      readonly kind: 'membership';
      readonly organizationId: OrganizationId;
      readonly membershipId: string;
    }
  | { readonly kind: 'other' };

/** The Organization a platform-scope page is about (its detail, its members or one membership), if any. */
export const organizationOfPage = (page: PlatformPage): OrganizationId | null =>
  page.kind === 'organization' || page.kind === 'members' || page.kind === 'membership'
    ? page.organizationId
    : null;

export function platformPageFromUrl(url: string): PlatformPage {
  const path = url.split(/[?#]/)[0] ?? '';
  const [first, id, section, organization, sub, membership, ...rest] = path
    .split('/')
    .filter((s) => s !== '');
  if (first !== PLATFORM_SCOPE_SEGMENT || !id) return { kind: 'other' };
  if (section === undefined) return { kind: 'dashboard' };
  if (section !== ORGANIZATIONS_SEGMENT || rest.length > 0) return { kind: 'other' };
  if (organization === undefined) return { kind: 'organizations' };
  const organizationIdOf = organizationId(decodeURIComponent(organization));
  if (sub === undefined) return { kind: 'organization', organizationId: organizationIdOf };
  if (sub !== MEMBERS_SEGMENT) return { kind: 'other' };
  return membership === undefined
    ? { kind: 'members', organizationId: organizationIdOf }
    : {
        kind: 'membership',
        organizationId: organizationIdOf,
        membershipId: decodeURIComponent(membership),
      };
}

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
 * directory gateway is bound. Only an owner has a Company directory; an operator's scope is their assignments, so
 * `platforms` is the one list of Platforms the actor may see: the Company's for an owner, the assigned ones (named
 * through the scope directory) for an operator.
 */
@Injectable()
export class ScopeContext {
  private readonly router = inject(Router);
  private readonly gateway = inject(ScopeDirectoryGateway);
  private readonly session = inject(AuthSession);
  /** "Try again" after the directory could not be loaded (the platform pages offer it). */
  private readonly reloads = new Subject<void>();

  /** The current URL, after each completed navigation: the one source the scope and the platform page come from. */
  readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { requireSync: true },
  );

  readonly scope = computed(() => scopeFromUrl(this.url()));

  /** Where in platform scope the URL is (dashboard, Organization directory, one Organization). */
  readonly platformPage = computed(() => platformPageFromUrl(this.url()));

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' ? actor.companyId : null;
  });

  /** One load per Company (and per reload), shared by the switcher, breadcrumbs and pages. */
  readonly directory$ = combineLatest([
    toObservable(this.companyId),
    this.reloads.pipe(startWith(undefined)),
  ]).pipe(
    switchMap(([id]) =>
      id === null
        ? of<ViewState<CompanyDirectory>>({ status: 'forbidden' })
        : toViewState(this.gateway.companyDirectory(id)),
    ),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly directory = toSignal(this.directory$, {
    initialValue: { status: 'idle' } as ViewState<CompanyDirectory>,
  });

  /** The Platforms the signed-in actor may see; loaded once per actor (and per reload). */
  readonly platforms$ = toObservable(this.session.actor).pipe(
    switchMap((actor) => {
      if (actor?.kind === 'operator') {
        return this.reloads.pipe(
          startWith(undefined),
          switchMap(() => toViewState(this.gateway.assignedPlatforms(actor.platformAssignments))),
        );
      }
      return this.directory$.pipe(
        map((state): ViewState<readonly PlatformRef[]> =>
          state.status === 'success' ? { status: 'success', data: state.data.platforms } : state,
        ),
      );
    }),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  readonly platforms = toSignal(this.platforms$, {
    initialValue: { status: 'idle' } as ViewState<readonly PlatformRef[]>,
  });

  /** Loads the directory (owner) or the assigned Platforms (operator) again. */
  reload(): void {
    this.reloads.next();
  }

  private readonly changes = signal(0);

  /**
   * Increments when the Company's hierarchy changed (a Platform or an Organization was created): views that list
   * Platforms or Organizations, or count them, reload on it, so every view shows the change, not only the one that
   * made it.
   */
  readonly revision = this.changes.asReadonly();

  /** Reports a change to the hierarchy: the directory reloads, and so does every view that follows `revision`. */
  hierarchyChanged(): void {
    this.changes.update((n) => n + 1);
    this.reload();
  }

  /**
   * Reports a change inside a Platform (an Organization was created): the views that follow `revision` reload, but not
   * the Platform directory, whose Platforms are unchanged (the platform-scope pages keep their access state).
   */
  organizationsChanged(): void {
    this.changes.update((n) => n + 1);
  }
}
