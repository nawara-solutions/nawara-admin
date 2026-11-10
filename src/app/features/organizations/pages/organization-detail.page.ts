import { CreateAdminInvitationAction } from '../application/admin-invitation.actions';
import {
  OrganizationDetailsPanel,
  OrganizationDetailsPanelData,
} from '../components/organization-details-panel';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  effect,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GrantsRefreshNotice } from '../../../layout/grants-refresh-notice/grants-refresh-notice';
import { can } from '../../../core/access/capability-policy';
import { homePath } from '../../../core/access/home-path';
import { AuthSession } from '../../../core/auth/auth-session';
import { EntityLabel } from '../../../core/context/entity-label';
import { ScopeContext, organizationsPath } from '../../../core/context/scope-context';
import { Metric, Section } from '../../../shared/dashboard/metric';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { EditOrganizationAction } from '../application/edit-organization.action';
import { OrganizationDetailFacade } from '../application/organization-detail.facade';
import { OrganizationGateway } from '../data-access/organization.gateway';
import { OrganizationMembersFacade } from '../application/organization-members.facade';
import { ListableMembershipStatus } from '../domain/membership.model';
import { AdminInvitationsPanel } from '../components/admin-invitations-panel';
import { OrganizationMembersPage } from './organization-members.page';

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
    GrantsRefreshNotice,
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwDataState,
    NwIcon,
    OrganizationMembersPage,
  ],
  templateUrl: './organization-detail.page.html',
  styleUrl: './organization-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'organization-detail' },
})
export class OrganizationDetailPage {
  protected readonly facade = inject(OrganizationDetailFacade);
  protected readonly invitationCreate = inject(CreateAdminInvitationAction);
  protected readonly members = inject(OrganizationMembersFacade);
  protected showMembers(status: ListableMembershipStatus): void {
    this.members.search.set('');
    this.members.setQuery({ status, admins: false });
  }
  private readonly dialogs = inject(NwDialogService);
  private readonly injector = inject(Injector);
  protected openInvitations(activeOnly = false): void {
    const view = this.facade.view();
    if (view.status !== 'ready' || !this.facade.showsAccess()) return;
    this.dialogs.open(AdminInvitationsPanel, {
      sidePanel: true,
      injector: this.injector,
      data: {
        activeOnly,
        target: {
          organizationId: view.detail.id,
          organizationName: view.detail.name,
          platformId: view.platform.id,
        },
      },
    });
  }
  protected openDetails(): void {
    const view = this.facade.view();
    if (view.status !== 'ready') return;
    const data: OrganizationDetailsPanelData = {
      activity: this.facade.showsActivity() ? {
        entries: view.detail.activity.status === 'available' ? view.detail.activity.data : null,
        platformId: view.platform.id,
        organizationId: view.detail.id,
        canBrowse: this.canBrowseActivity(),
      } : null,
      detail: () => {
        const current = this.facade.view();
        return current.status === 'ready' ? current.detail : view.detail;
      },
      platform: view.platform,
      mayEdit: this.edit.mayEdit(view.platform.id),
      editAvailable: this.edit.available,
      showCommercial: this.facade.showsCommercial(),
      canViewSubscriptions: this.canViewSubscriptions(),
      commercial: () => this.facade.commercial(),
      retryCommercial: () => this.facade.reloadCommercial(),
      edit: () => {
        const current = this.facade.view();
        if (current.status === 'ready') this.edit.open(current.detail);
      },
    };
    this.dialogs.open(OrganizationDetailsPanel, { data, sidePanel: true });
  }
  /** "Edit details" (P3b-S2): the owner and an operator assigned to the Platform; no step-up. */
  protected readonly edit = inject(EditOrganizationAction);
  private readonly session = inject(AuthSession);
  private readonly context = inject(ScopeContext);
  private readonly label = inject(EntityLabel);
  private readonly organizationGateway = inject(OrganizationGateway);
  protected readonly organizationsPath = organizationsPath;

  protected readonly home = computed(() => homePath(this.session.actor()));
  protected readonly canOpenPlatforms = computed(() =>
    can(this.session.actor(), 'company.platforms.view'),
  );
  /** The activity browser (`/audit`, P8-S1): the Company owner's. */
  protected readonly canBrowseActivity = computed(() =>
    can(this.session.actor(), 'company.audit.view'),
  );
  /** The Platform's subscription directory (`/licenses/platforms/:platformId`, P7-S2): the Company owner's. */
  protected readonly canViewSubscriptions = computed(() =>
    can(this.session.actor(), 'company.commercial.view'),
  );
  protected readonly accessKey = computed(() =>
    this.session.actor()?.kind === 'operator'
      ? 'organizations.header.accessOperator'
      : 'organizations.header.accessOwner',
  );

  /** This page's URL path (no query): the key of the breadcrumb label it sets. */
  private readonly path = computed(() => this.context.url().split(/[?#]/)[0] ?? '');

  constructor() {
    effect((onCleanup) => {
      const view = this.facade.view();
      if (view.status !== 'ready') return;
      const platformId = view.platform.id;
      const subscription = this.organizationGateway.list(platformId).subscribe({
        next: (directory) => {
          if (directory.platformId === platformId)
            this.label.setOrganizations(
              platformId,
              directory.organizations
                .filter((item) => item.platformId === platformId)
                .map(({ id, name }) => ({ id, name })),
            );
        },
        error: () => this.label.clearOrganizations(platformId),
      });
      onCleanup(() => {
        subscription.unsubscribe();
        this.label.clearOrganizations(platformId);
      });
    });
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
}
