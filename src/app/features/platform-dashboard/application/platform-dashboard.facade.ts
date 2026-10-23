import { Injectable, Signal, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can, canEnterPlatform } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { PlatformId, PlatformRef } from '../../../core/context/scope.model';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { Section } from '../../../shared/dashboard/metric';
import { PlatformCommercialGateway } from '../data-access/platform-commercial.gateway';
import { PlatformDashboardGateway } from '../data-access/platform-dashboard.gateway';
import {
  OrganizationSubscriptionState,
  PlatformCommercial,
  SubscriptionCounts,
  subscriptionCounts,
} from '../domain/platform-commercial.model';
import { PlatformDashboard } from '../domain/platform-dashboard.model';

/**
 * Whether the Platform in the URL can be shown, before anything about it is requested:
 * - `checking`: the actor's Platforms are still loading;
 * - `directoryUnavailable`: they could not be listed (an outage, never an access refusal; "Try again");
 * - `notAccessible`: unknown, or outside the actor's scope (one state, as Core collapses both into `404`);
 * - `granted`: the actor may enter it (UX; Core authorizes every request).
 */
export type PlatformAccess =
  | { readonly status: 'checking' }
  | { readonly status: 'directoryUnavailable' }
  | { readonly status: 'notAccessible' }
  | { readonly status: 'granted'; readonly platform: PlatformRef };

/** Attention items of the dashboard (machine values; labels come from the catalog). */
export type PlatformAttentionKind =
  'membership_requests' | 'admin_invitations' | 'subscription_grace' | 'payment_issues';

export interface PlatformAttentionItem {
  readonly kind: PlatformAttentionKind;
  readonly count: number;
  /** `membership_requests`: in how many Organizations. */
  readonly organizations?: number;
  /** `subscription_grace`: the Organization's name (one) and when its grace ends. */
  readonly organizationName?: string;
  readonly graceEndsAt?: string;
  readonly tone: 'info' | 'warning';
}

const IDLE = { status: 'idle' } as const;
const LOADING = { status: 'loading' } as const;

/**
 * View state of the Platform dashboard (`/platforms/:platformId`; docs/ARCHITECTURE.md §5, §7), scoped to the route.
 *
 * The Platform comes from the URL (`ScopeContext.scope`), so a deep link, a refresh and the scope switcher all work, and
 * every request carries the Platform id explicitly. Two independent loads (hierarchy, commercial) behind two gateways;
 * switching Platforms cancels the previous requests (`switchMap`) and an answer for another Platform is never shown.
 * Owner-only sections are asked for only when the actor has the capability (UX; Core is the authority).
 */
@Injectable()
export class PlatformDashboardFacade {
  private readonly context = inject(ScopeContext);
  private readonly session = inject(AuthSession);
  private readonly dashboardGateway = inject(PlatformDashboardGateway);
  private readonly commercialGateway = inject(PlatformCommercialGateway);
  private readonly reloads = new Subject<void>();

  readonly access = computed<PlatformAccess>(() => {
    const scope = this.context.scope();
    if (scope.kind !== 'platform') return { status: 'notAccessible' };
    const platforms = this.context.platforms();
    switch (platforms.status) {
      case 'idle':
      case 'loading':
        return { status: 'checking' };
      case 'error':
        return { status: 'directoryUnavailable' };
      case 'success': {
        const platform = platforms.data.find((p) => p.id === scope.platformId);
        const allowed = canEnterPlatform(
          this.session.actor(),
          scope.platformId,
          platforms.data.map((p) => p.id),
        );
        return platform && allowed ? { status: 'granted', platform } : { status: 'notAccessible' };
      }
      default:
        return { status: 'notAccessible' };
    }
  });

  /** The Platform to load, or `null`: nothing is requested for a Platform that cannot be shown. */
  private readonly platformId = computed<PlatformId | null>(() => {
    const access = this.access();
    return access.status === 'granted' ? access.platform.id : null;
  });

  readonly showsCommercial = computed(() => can(this.session.actor(), 'platform.commercial.view'));
  readonly showsActivity = computed(() => can(this.session.actor(), 'platform.activity.view'));
  readonly showsAccess = computed(() => can(this.session.actor(), 'platform.access.view'));
  readonly canOpenPlatforms = computed(() => can(this.session.actor(), 'company.platforms.view'));

  private readonly commercialPlatformId = computed(() =>
    this.showsCommercial() ? this.platformId() : null,
  );

  private readonly dashboardRaw = this.load(
    (id) => this.dashboardGateway.load(id),
    this.platformId,
  );
  private readonly commercialRaw = this.load(
    (id) => this.commercialGateway.load(id),
    this.commercialPlatformId,
  );

  /** The dashboard of the Platform in the URL; an answer still on screen for the previous Platform reads as loading. */
  readonly state = computed<ViewState<PlatformDashboard>>(() =>
    this.current(this.dashboardRaw(), this.platformId()),
  );

  readonly commercial = computed<ViewState<PlatformCommercial>>(() =>
    this.current(this.commercialRaw(), this.commercialPlatformId()),
  );

  readonly subscriptions = computed<Section<SubscriptionCounts>>(() => {
    const commercial = this.commercial();
    if (
      commercial.status !== 'success' ||
      commercial.data.organizationSubscriptions.status !== 'available'
    )
      return { status: 'unavailable' };
    return {
      status: 'available',
      data: subscriptionCounts(commercial.data.organizationSubscriptions.data),
    };
  });

  /** The subscription state of each listed Organization (owner only; empty otherwise). */
  readonly subscriptionOf = computed<ReadonlyMap<string, OrganizationSubscriptionState>>(() => {
    const commercial = this.commercial();
    if (
      commercial.status !== 'success' ||
      commercial.data.organizationSubscriptions.status !== 'available'
    )
      return new Map();
    return new Map(
      commercial.data.organizationSubscriptions.data.map((s) => [s.organizationId, s.state]),
    );
  });

  /**
   * "Needs attention": membership requests for everyone who sees the Platform; invitations, Organizations in grace and
   * payment issues for the owner. Presentation-only composition; each count still comes from its own domain.
   */
  readonly attention = computed<Section<readonly PlatformAttentionItem[]>>(() => {
    const state = this.state();
    if (state.status !== 'success' || state.data.figures.status !== 'available')
      return { status: 'unavailable' };
    const items: PlatformAttentionItem[] = [];
    const figures = state.data.figures.data;
    if (figures.membershipRequests.status === 'available' && figures.membershipRequests.value > 0) {
      items.push({
        kind: 'membership_requests',
        count: figures.membershipRequests.value,
        tone: 'info',
        ...(figures.organizationsWithRequests.status === 'available'
          ? { organizations: figures.organizationsWithRequests.value }
          : {}),
      });
    }
    const invitations = state.data.adminInvitationsAwaiting;
    if (this.showsAccess() && invitations.status === 'available') {
      const metric = invitations.data;
      if (metric.status === 'available' && metric.value > 0)
        items.push({ kind: 'admin_invitations', count: metric.value, tone: 'info' });
    }
    const commercial = this.commercial();
    if (this.showsCommercial() && commercial.status === 'success') {
      const subscriptions = commercial.data.organizationSubscriptions;
      if (subscriptions.status === 'available') {
        const grace = subscriptions.data.filter((s) => s.state === 'grace');
        const [first] = grace;
        if (first)
          items.push({
            kind: 'subscription_grace',
            count: grace.length,
            tone: 'warning',
            ...(grace.length === 1
              ? {
                  organizationName: first.organizationName,
                  ...(first.graceEndsAt ? { graceEndsAt: first.graceEndsAt } : {}),
                }
              : {}),
          });
      }
      const payments = commercial.data.paymentIssues;
      if (
        payments.status === 'available' &&
        payments.data.status === 'available' &&
        payments.data.value > 0
      )
        items.push({ kind: 'payment_issues', count: payments.data.value, tone: 'warning' });
    }
    return { status: 'available', data: items };
  });

  /** "Try again": both loads, or (when the Platforms could not be listed) the scope directory. */
  reload(): void {
    if (this.access().status === 'directoryUnavailable') this.context.reload();
    else this.reloads.next();
  }

  private load<T>(
    request: (platform: PlatformId) => Observable<T>,
    platform: Signal<PlatformId | null>,
  ): Signal<ViewState<T>> {
    return toSignal(
      combineLatest([toObservable(platform), this.reloads.pipe(startWith(undefined))]).pipe(
        switchMap(([id]) => (id === null ? of<ViewState<T>>(IDLE) : toViewState(request(id)))),
      ),
      { initialValue: IDLE as ViewState<T> },
    );
  }

  /** An answer about another Platform than the one asked for now (a switch in flight) is shown as loading. */
  private current<T extends { readonly platformId: PlatformId }>(
    state: ViewState<T>,
    platform: PlatformId | null,
  ): ViewState<T> {
    if (platform === null) return IDLE;
    return state.status === 'success' && state.data.platformId !== platform ? LOADING : state;
  }
}
