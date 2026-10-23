import { Injectable, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { PlatformAccess, platformAccessOf } from '../../../core/context/platform-access';
import { ScopeContext } from '../../../core/context/scope-context';
import { OrganizationId, PlatformId, PlatformRef } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState } from '../../../core/state/view-state';
import { Metric } from '../../../shared/dashboard/metric';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NW_FORMATTING_LOCALE } from '../../../shared/format/formatting-locale';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import { OrganizationCommercialSummary } from '../domain/organization-commercial.model';
import { OrganizationDirectory } from '../domain/organization.model';
import { keyedLoad } from './keyed-load';
import {
  DirectoryRow,
  OrganizationQuery,
  applyQuery,
  parseQuery,
  toQueryParams,
} from './organization-query';

/** What the directory page shows; every state but the access ones names the Platform (the header needs it). */
export type OrganizationDirectoryView =
  | Exclude<PlatformAccess, { readonly status: 'granted' }>
  | { readonly status: 'loading'; readonly platform: PlatformRef }
  | { readonly status: 'notInBuild'; readonly platform: PlatformRef }
  | { readonly status: 'error'; readonly platform: PlatformRef }
  | { readonly status: 'refused'; readonly platform: PlatformRef }
  | {
      readonly status: 'ready';
      readonly platform: PlatformRef;
      readonly directory: OrganizationDirectory;
    };

/** The Platform's totals, from the loaded list (an unknown count leaves its total unknown). */
export interface DirectoryTotals {
  readonly organizations: number;
  readonly memberships: Metric;
  readonly requests: Metric;
  readonly organizationsWithRequests: number;
}

const sum = (metrics: readonly Metric[]): Metric =>
  metrics.every((m) => m.status === 'available')
    ? {
        status: 'available',
        value: metrics.reduce((n, m) => n + (m.status === 'available' ? m.value : 0), 0),
      }
    : { status: 'unavailable' };

/**
 * View state of the Organization directory (`/platforms/:platformId/organizations`; docs/ARCHITECTURE.md §5, §7),
 * scoped to the route.
 *
 * - The Platform comes from the URL and is checked first (`platformAccessOf`): nothing is requested for a Platform the
 *   actor cannot enter, and a list answer for another Platform than the one in the URL now is never shown.
 * - The commercial columns are the owner's only: for anyone else the commercial gateway is never called.
 * - Search, filters and sort live in the URL's query parameters (organization-query.ts) and are applied here, in the
 *   browser, to the loaded list: no request per keystroke.
 */
@Injectable()
export class OrganizationDirectoryFacade {
  private readonly context = inject(ScopeContext);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly gateway = inject(OrganizationGateway);
  private readonly commercialGateway = inject(OrganizationCommercialGateway);
  /** The collation follows the active language (the formatting locale: Arabic with Latin digits). */
  private readonly locale = inject(NW_FORMATTING_LOCALE);
  private readonly now = inject(NW_CLOCK);
  private readonly reloads = new Subject<void>();
  private readonly commercialReloads = new Subject<void>();

  readonly access = computed<PlatformAccess>(() =>
    platformAccessOf(this.context.scope(), this.context.platforms(), this.session.actor()),
  );

  /** Owner only (UX; Core is the authority): subscriptions and the assisted-payments policy. */
  readonly showsCommercial = computed(() => can(this.session.actor(), 'platform.commercial.view'));

  /** The Platform to load, or `null`: nothing is requested for a Platform that cannot be shown. */
  private readonly platformId = computed<PlatformId | null>(() => {
    const access = this.access();
    return access.status === 'granted' ? access.platform.id : null;
  });

  private readonly commercialPlatformId = computed(() =>
    this.showsCommercial() ? this.platformId() : null,
  );

  private readonly raw = keyedLoad(this.platformId, this.reloads, (id) => this.gateway.list(id));
  private readonly commercialRaw = keyedLoad(
    this.commercialPlatformId,
    this.commercialReloads,
    (id) => this.commercialGateway.list(id),
  );

  readonly view = computed<OrganizationDirectoryView>(() => {
    const access = this.access();
    if (access.status !== 'granted') return access;
    const { platform } = access;
    const state = this.raw();
    switch (state.status) {
      case 'success':
        // A late answer about another Platform (a switch in flight) reads as loading.
        return state.data.platformId === platform.id
          ? { status: 'ready', platform, directory: state.data }
          : { status: 'loading', platform };
      case 'forbidden':
        return { status: 'refused', platform };
      case 'error':
        if (state.error.kind === 'not_found') return { status: 'refused', platform };
        return state.error.kind === 'unavailable' && state.error.code === ADAPTER_UNAVAILABLE
          ? { status: 'notInBuild', platform }
          : { status: 'error', platform };
      default:
        return { status: 'loading', platform };
    }
  });

  /** The owner's commercial facts by Organization, or why they are missing; `idle` for anyone else. */
  readonly commercial = computed<
    ViewState<ReadonlyMap<OrganizationId, OrganizationCommercialSummary>>
  >(() => {
    const platform = this.commercialPlatformId();
    const state = this.commercialRaw();
    if (platform === null) return { status: 'idle' };
    if (state.status !== 'success') return state;
    if (state.data.platformId !== platform) return { status: 'loading' };
    return {
      status: 'success',
      data: new Map(state.data.organizations.map((c) => [c.organizationId, c])),
    };
  });

  /** The search, filters and sort in the URL. The subscription filter is ignored for anyone but the owner. */
  readonly query = computed<OrganizationQuery>(() => {
    const query = parseQuery(this.router.parseUrl(this.context.url()).queryParams);
    return this.showsCommercial() ? query : { ...query, subscription: 'any' };
  });

  /** Whether the subscription filter can work now: the owner, with the commercial facts loaded. */
  readonly subscriptionFilterAvailable = computed(
    () => this.showsCommercial() && this.commercial().status === 'success',
  );

  readonly totals = computed<DirectoryTotals | null>(() => {
    const view = this.view();
    if (view.status !== 'ready') return null;
    const organizations = view.directory.organizations;
    return {
      organizations: organizations.length,
      memberships: sum(organizations.map((o) => o.memberships)),
      requests: sum(organizations.map((o) => o.pendingRequests)),
      organizationsWithRequests: organizations.filter(
        (o) => o.pendingRequests.status === 'available' && o.pendingRequests.value > 0,
      ).length,
    };
  });

  /** The rows to show: the loaded Organizations, joined with the owner's commercial facts, filtered and sorted. */
  readonly rows = computed<readonly DirectoryRow[]>(() => {
    const view = this.view();
    if (view.status !== 'ready') return [];
    const commercial = this.commercial();
    const facts = commercial.status === 'success' ? commercial.data : null;
    const rows = view.directory.organizations.map((organization) => ({
      organization,
      commercial: facts?.get(organization.id) ?? null,
    }));
    return applyQuery(rows, this.query(), {
      now: this.now(),
      collator: new Intl.Collator(this.locale(), { sensitivity: 'base' }),
      subscriptions: this.subscriptionFilterAvailable(),
    });
  });

  /** Changes the search, filters or sort: a URL change (replacing the history entry), so it is shareable. */
  setQuery(change: Partial<OrganizationQuery>): void {
    const tree = this.router.parseUrl(this.router.url);
    tree.queryParams = toQueryParams({ ...this.query(), ...change });
    void this.router.navigateByUrl(tree, { replaceUrl: true });
  }

  /** "Try again": the list (and the owner's facts), or the scope directory when the Platforms could not be listed. */
  reload(): void {
    if (this.access().status === 'directoryUnavailable') this.context.reload();
    else {
      this.reloads.next();
      this.commercialReloads.next();
    }
  }

  reloadCommercial(): void {
    this.commercialReloads.next();
  }
}
