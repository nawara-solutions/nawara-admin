import { Injectable, Signal, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, Subject, combineLatest, of, startWith, switchMap } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { CompanyId } from '../../../core/context/scope.model';
import { ViewState, toViewState } from '../../../core/state/view-state';
import { CommercialSummaryGateway } from '../data-access/commercial-summary.gateway';
import { CompanyOverviewGateway } from '../data-access/company-overview.gateway';
import { ServiceHealthGateway } from '../data-access/service-health.gateway';
import { CommercialSummary } from '../domain/commercial-summary.model';
import { AttentionKind, CompanyOverview, Section } from '../domain/company-overview.model';
import { ServiceHealthSummary } from '../domain/service-health.model';

/** An attention item as shown: the overview's own kinds plus the commercial "licenses expiring soon". */
export type AttentionView = AttentionKind | 'licenses_expiring';

export interface AttentionViewItem {
  readonly kind: AttentionView;
  readonly count: number;
  /** Licenses expiring: the window, in days, they expire within. */
  readonly withinDays?: number;
}

const IDLE = { status: 'idle' } as const;

/**
 * View state and commands of the Company Overview (docs/ARCHITECTURE.md §5). Scoped to the feature route.
 *
 * Three independent loads (overview, commercial summary, service health) behind three gateways: one failing never
 * hides the others. Only an owner has a Company scope: for any other actor the facade calls no gateway and reports
 * `forbidden` (UX; Core is the authority). Reloading cancels the previous requests (`switchMap`).
 */
@Injectable()
export class CompanyOverviewFacade {
  private readonly overviewGateway = inject(CompanyOverviewGateway);
  private readonly commercialGateway = inject(CommercialSummaryGateway);
  private readonly healthGateway = inject(ServiceHealthGateway);
  private readonly session = inject(AuthSession);
  private readonly reloads = new Subject<void>();

  private readonly companyId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'company.overview.view') ? actor.companyId : null;
  });

  private readonly scoped$ = combineLatest([
    toObservable(this.companyId),
    this.reloads.pipe(startWith(undefined)),
  ]);

  private load<T>(request: (company: CompanyId) => Observable<T>): Signal<ViewState<T>> {
    return toSignal(
      this.scoped$.pipe(
        switchMap(([id]) =>
          id === null ? of<ViewState<T>>({ status: 'forbidden' }) : toViewState(request(id)),
        ),
      ),
      { initialValue: IDLE as ViewState<T> },
    );
  }

  readonly state = this.load<CompanyOverview>((id) => this.overviewGateway.load(id));
  readonly commercial = this.load<CommercialSummary>((id) => this.commercialGateway.load(id));
  readonly health = this.load<ServiceHealthSummary>(() => this.healthGateway.load());

  /**
   * "Needs attention": the overview's items, then "licenses expiring soon" when the commercial summary has a positive
   * count. Presentation-only composition; each count still comes from its own domain.
   */
  readonly attention = computed<Section<readonly AttentionViewItem[]>>(() => {
    const overview = this.state();
    if (overview.status !== 'success' || overview.data.attention.status !== 'available') {
      return { status: 'unavailable' };
    }
    const items: AttentionViewItem[] = [...overview.data.attention.data];
    const commercial = this.commercial();
    if (commercial.status === 'success') {
      const expiring = commercial.data.expiringSoon;
      if (expiring.status === 'available' && expiring.value > 0) {
        items.push({
          kind: 'licenses_expiring',
          count: expiring.value,
          withinDays: commercial.data.expiringWithinDays,
        });
      }
    }
    return { status: 'available', data: items };
  });

  /**
   * Change in total organizations over the period, from the growth history (last point minus first); `null` without a
   * history of at least two points. Never a separate figure that could disagree with the chart.
   */
  readonly organizationsTrend = computed<number | null>(() => {
    const overview = this.state();
    if (overview.status !== 'success' || overview.data.growth.status !== 'available') return null;
    const points = overview.data.growth.data.points;
    const first = points[0];
    const last = points.at(-1);
    return first && last && points.length > 1 ? last.organizations - first.organizations : null;
  });

  /** Access assignments waiting for review (the "Needs attention" item), or `null` when unknown. */
  readonly assignmentsToReview = computed<number | null>(() => {
    const attention = this.attention();
    if (attention.status !== 'available') return null;
    return attention.data.find((i) => i.kind === 'access_assignments_to_review')?.count ?? 0;
  });

  /** Whether the Create platform action is shown at all (owner only, as Core's `canCreatePlatform`). */
  readonly canSeeCreatePlatform = computed(() => can(this.session.actor(), 'platform.create'));

  reload(): void {
    this.reloads.next();
  }
}
