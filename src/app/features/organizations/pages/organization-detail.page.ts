import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { can } from '../../../core/access/capability-policy';
import { homePath } from '../../../core/access/home-path';
import { AuthSession } from '../../../core/auth/auth-session';
import { EntityLabel } from '../../../core/context/entity-label';
import { ScopeContext, organizationsPath, platformPath } from '../../../core/context/scope-context';
import { OverviewCard } from '../../../shared/dashboard/overview-card/overview-card';
import { SummaryCard } from '../../../shared/dashboard/summary-card/summary-card';
import { MetricValue } from '../../../shared/dashboard/metric-value/metric-value';
import { Metric, Section } from '../../../shared/dashboard/metric';
import { NW_CLOCK } from '../../../shared/format/clock';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { OrganizationDetailFacade } from '../application/organization-detail.facade';
import {
  SUBSCRIPTION_BADGES,
  policyKeys,
  subscriptionNote,
} from '../components/commercial-display';
import { OrganizationActivity } from '../components/organization-activity/organization-activity';
import { OrganizationsHeader } from '../components/organizations-header/organizations-header';
import { OrganizationSubscription } from '../domain/organization-commercial.model';

const UNAVAILABLE: Metric = { status: 'unavailable' };

/**
 * One Organization (`/platforms/:platformId/organizations/:organizationId`; P3a design, artboards 2, 4, 7, 8, 9), read
 * only. Everyone who may see the Platform sees its identity, membership figures and About; the owner also sees
 * invitations, activity, the subscription, payment issues and the effective assisted-payments policy. No lifecycle
 * status is shown: Core defines none. Actions whose destination is not built are shown unavailable and say so.
 */
@Component({
  selector: 'adm-organization-detail-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    MetricValue,
    NwButton,
    NwDataState,
    NwDatePipe,
    NwIcon,
    NwStatusBadge,
    OrganizationActivity,
    OrganizationsHeader,
    OverviewCard,
    SummaryCard,
  ],
  templateUrl: './organization-detail.page.html',
  styleUrl: './organization-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'organization-detail' },
})
export class OrganizationDetailPage {
  protected readonly facade = inject(OrganizationDetailFacade);
  private readonly session = inject(AuthSession);
  private readonly context = inject(ScopeContext);
  private readonly label = inject(EntityLabel);
  private readonly now = inject(NW_CLOCK);
  protected readonly badges = SUBSCRIPTION_BADGES;
  protected readonly policyKeys = policyKeys;
  protected readonly platformPath = platformPath;
  protected readonly organizationsPath = organizationsPath;

  protected readonly home = computed(() => homePath(this.session.actor()));
  protected readonly canOpenPlatforms = computed(() =>
    can(this.session.actor(), 'company.platforms.view'),
  );
  protected readonly accessKey = computed(() =>
    this.session.actor()?.kind === 'operator'
      ? 'organizations.header.accessOperator'
      : 'organizations.header.accessOwner',
  );

  /** This page's URL path (no query): the key of the breadcrumb label it sets. */
  private readonly path = computed(() => this.context.url().split(/[?#]/)[0] ?? '');

  constructor() {
    // The breadcrumbs show the Organization's name once it is shown here, and never after (EntityLabel).
    let published: string | null = null;
    effect(() => {
      const view = this.facade.view();
      const path = this.path();
      if (published !== null && published !== path) this.label.clear(published);
      if (view.status === 'ready') {
        this.label.set(path, view.detail.name);
        published = path;
      } else {
        this.label.clear(path);
        published = null;
      }
    });
    inject(DestroyRef).onDestroy(() => {
      if (published !== null) this.label.clear(published);
    });
  }

  protected metricOf(section: Section<Metric>): Metric {
    return section.status === 'available' ? section.data : UNAVAILABLE;
  }

  protected noteOf(subscription: OrganizationSubscription) {
    return subscriptionNote(subscription, this.now());
  }
}
