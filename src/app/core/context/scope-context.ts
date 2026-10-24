import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import {
  Observable,
  Subject,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  of,
  shareReplay,
  skip,
  startWith,
  switchMap,
  tap,
} from 'rxjs';
import { AuthSession } from '../auth/auth-session';
import { OperatorGrantsRefresh } from '../auth/operator-grants-refresh';
import { toAppError } from '../errors/app-error';
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

/**
 * One Platform's Organization subscriptions (P7-S2): a company-scope commercial page (the owner's), never platform scope,
 * so it lives under `/licenses` and an operator assigned to the Platform never reaches it through the Platform's URLs.
 */
export const platformSubscriptionsPath = (platform: PlatformId): string =>
  `/licenses/${PLATFORM_SCOPE_SEGMENT}/${encodeURIComponent(platform)}`;

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

  constructor() {
    // An operator switching Platforms (switcher, link or address) re-reads their grants once per switch (P6-S2b). The
    // first Platform after sign-in is not a switch: the grants were just read.
    toObservable(this.scope)
      .pipe(
        map((scope) => (scope.kind === 'platform' ? scope.platformId : null)),
        filter((id): id is PlatformId => id !== null),
        distinctUntilChanged(),
        skip(1),
      )
      .subscribe(() => {
        if (this.session.actor()?.kind === 'operator') this.grants?.refresh('switch');
      });
  }

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

  /**
   * The signed-in operator's grants refresh (P6-S2b), where the shell provides it. Display state only: it never
   * replaces Core's authorization of each request.
   */
  private readonly grants = inject(OperatorGrantsRefresh, { optional: true });

  /**
   * Loads the directory (owner) or the assigned Platforms (operator) again. For an operator, "Try again" also re-reads
   * their grants first (P6-S2b), so the list it reloads is Core's current one.
   */
  reload(): void {
    if (this.session.actor()?.kind === 'operator') this.grants?.refresh('retry');
    this.reloads.next();
  }

  /**
   * A platform-scope request was refused (Core's collapsed `404`, or `403`) for a Platform the operator's list still
   * shows: their access may have changed, so their grants are re-read (P6-S2b). The refusal itself stands; nothing is
   * resent. Nothing happens for an owner or for a Platform the list no longer shows.
   */
  platformRefused(platform: PlatformId): void {
    const actor = this.session.actor();
    if (actor?.kind === 'operator' && actor.platformAssignments.includes(platform))
      this.grants?.refresh('refusal', platform);
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

/**
 * Reports a refused platform-scope read (Core's collapsed `404`, a `403`, or a `401`) to `ScopeContext.platformRefused`, so a
 * signed-in operator's grants are re-read (P6-S2b). The error is passed on unchanged: the refusal stands.
 */
export function reportsRefusal<T>(
  scope: ScopeContext,
  platform: PlatformId,
): (source: Observable<T>) => Observable<T> {
  return (source) =>
    source.pipe(
      tap({
        error: (thrown: unknown) => {
          const kind = toAppError(thrown).kind;
          // A `401` too (P6-S3): Core refuses every request of an operator whose session it ended (a block). The
          // grants read that follows answers `401` as well, and only THAT ends the local session.
          if (kind === 'not_found' || kind === 'forbidden' || kind === 'unauthenticated')
            scope.platformRefused(platform);
        },
      }),
    );
}
