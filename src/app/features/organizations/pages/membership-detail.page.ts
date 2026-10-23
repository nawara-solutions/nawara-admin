import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { membersPath } from '../../../core/context/scope-context';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwSpinner } from '../../../shared/ui/spinner/spinner';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import { isolated } from '../../platforms/domain/create-platform.model';
import { MembershipDecisionAction } from '../application/membership-decision.action';
import { MembershipRevokeAction } from '../application/membership-revoke.action';
import { OrganizationAdminRoleAction } from '../application/organization-admin-role.action';
import { publishOrganizationLabel } from '../application/organization-label';
import { OrganizationMembersFacade } from '../application/organization-members.facade';
import { OrganizationStates } from '../components/organization-states/organization-states';
import { OrganizationsHeader } from '../components/organizations-header/organizations-header';
import { MembershipDecision } from '../domain/membership-decision.model';
import { ListableMembershipStatus, Membership, memberIdentity } from '../domain/membership.model';

/** Catalog keys and tones, listed in full (never built at runtime). */
const STATUS = {
  active: { tone: 'success', key: 'organizations.members.status.active' },
  pending: { tone: 'warning', key: 'organizations.members.detail.statusPending' },
  rejected: { tone: 'danger', key: 'organizations.members.status.rejected' },
} as const satisfies Record<
  ListableMembershipStatus,
  { readonly tone: NwStatusTone; readonly key: string }
>;

/**
 * One membership (`…/members/:membershipId`; P5-S1 design, artboard 3). Resolved from the Organization's membership
 * lists (Core has no single-membership read); an id in none of them (unknown, another Organization's, revoked) is one
 * "not found". Shows only Core's fields: no name, no admission provenance, no other memberships.
 *
 * A pending request the actor may decide has a Decision card (P5-S2 design, artboard 2). After a success the page
 * stays: the status badge changes once the lists are reloaded, the card goes, and focus moves to the facts heading.
 *
 * An active membership the actor may revoke has a "Manage membership" card (P5-S3a). After a revocation the page
 * returns to the members list: a revoked membership is not listable, so this page would read "not found". For the
 * owner the card also changes the organization-admin role (P5-S3b): the page stays, the role badge changes once the
 * lists are reloaded, and focus moves to the facts heading.
 */
@Component({
  selector: 'adm-membership-detail-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwDataState,
    NwDatePipe,
    NwIcon,
    NwSpinner,
    NwStatusBadge,
    OrganizationStates,
    OrganizationsHeader,
  ],
  templateUrl: './membership-detail.page.html',
  styleUrl: './membership-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'membership-detail' },
})
export class MembershipDetailPage {
  protected readonly facade = inject(OrganizationMembersFacade);
  protected readonly status = STATUS;
  protected readonly membersPath = membersPath;
  protected readonly identity = memberIdentity;

  protected readonly resolution = this.facade.membership;
  protected readonly decisions = inject(MembershipDecisionAction);
  protected readonly revocations = inject(MembershipRevokeAction);
  protected readonly roles = inject(OrganizationAdminRoleAction);
  /** The role change made on this page, while under way (focus follows its success). */
  private roleChange: { readonly membershipId: string; readonly admin: boolean } | null = null;
  private readonly router = inject(Router);
  /** Whether a revocation made on this page is under way (its success returns to the list). */
  private revoking = false;
  protected readonly isolated = isolated;
  private readonly session = inject(AuthSession);
  private readonly injector = inject(Injector);
  private readonly factsHeading = viewChild<ElementRef<HTMLElement>>('factsHeading');
  /** Whether a decision made on this page is under way (focus follows its success). */
  private deciding = false;

  protected readonly authority = computed(() => this.session.actor()?.kind ?? null);

  constructor() {
    publishOrganizationLabel(
      computed(() => {
        const view = this.facade.view();
        return 'organization' in view ? view.organization.name : null;
      }),
    );

    // Once a role change made here succeeded and the reloaded lists show it, focus the facts heading.
    effect(() => {
      const done = this.roles.succeeded();
      const change = this.roleChange;
      const found = this.resolution();
      if (done === null || change === null || done.membershipId !== change.membershipId) return;
      if (found.status !== 'found' || found.membership.isOrganizationAdmin !== change.admin) return;
      this.roleChange = null;
      untracked(() => this.roles.succeeded.set(null));
      afterNextRender(() => this.factsHeading()?.nativeElement.focus(), {
        injector: this.injector,
      });
    });

    // Once a revocation made here succeeded, return to the members list (it focuses its count).
    effect(() => {
      const done = this.revocations.succeeded();
      const view = this.facade.view();
      if (!this.revoking || done === null || !('organization' in view)) return;
      this.revoking = false;
      untracked(() => {
        this.revocations.succeeded.set(null);
        this.revocations.returnedFromDetails.set(true);
      });
      void this.router.navigateByUrl(membersPath(view.platform.id, view.organization.id));
    });

    // Once a decision made here succeeded and the reloaded lists show it decided, focus the facts heading.
    effect(() => {
      const done = this.decisions.succeeded();
      const found = this.resolution();
      if (!this.deciding || done === null || found.status !== 'found') return;
      if (found.membership.id !== done.membershipId || found.membership.status === 'pending')
        return;
      this.deciding = false;
      untracked(() => this.decisions.succeeded.set(null));
      afterNextRender(() => this.factsHeading()?.nativeElement.focus(), {
        injector: this.injector,
      });
    });
  }

  protected revoke(
    membership: Membership,
    platformId: PlatformId,
    organizationId: OrganizationId,
    organizationName: string,
  ): void {
    this.revoking = true;
    this.revocations.succeeded.set(null);
    this.revocations.open({ target: { platformId, organizationId, organizationName }, membership });
  }

  protected changeRole(
    membership: Membership,
    admin: boolean,
    platformId: PlatformId,
    organizationId: OrganizationId,
    organizationName: string,
  ): void {
    this.roleChange = { membershipId: membership.id, admin };
    this.roles.succeeded.set(null);
    this.roles.open({
      target: { platformId, organizationId, organizationName },
      membership,
      admin,
    });
  }

  protected decide(
    membership: Membership,
    decision: MembershipDecision,
    platformId: PlatformId,
    organizationId: OrganizationId,
    organizationName: string,
  ): void {
    this.deciding = true;
    this.decisions.succeeded.set(null);
    this.decisions.open({
      target: { platformId, organizationId, organizationName },
      membership,
      decision,
    });
  }
}
