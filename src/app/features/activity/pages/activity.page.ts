import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { organizationPath, platformPath } from '../../../core/context/scope-context';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { ACTIVITY_ACTIONS, ActivityFacade } from '../application/activity.facade';
import { ActivityAction } from '../domain/activity.model';

/** Catalog keys of the actions, listed in full (never built at runtime). */
const ACTION_KEYS = {
  'platform.created': 'activity.actions.platformCreated',
  'organization.created': 'activity.actions.organizationCreated',
  'organization.updated': 'activity.actions.organizationUpdated',
  'admin_invitation.created': 'activity.actions.adminInvitationCreated',
  'admin_invitation.revoked': 'activity.actions.adminInvitationRevoked',
  'membership.approved': 'activity.actions.membershipApproved',
  'membership.rejected': 'activity.actions.membershipRejected',
  'membership.revoked': 'activity.actions.membershipRevoked',
  'organization.admin.granted': 'activity.actions.organizationAdminGranted',
  'organization.admin.revoked': 'activity.actions.organizationAdminRevoked',
  'operator.assigned': 'activity.actions.operatorAssigned',
  'operator.unassigned': 'activity.actions.operatorUnassigned',
  'operator.created': 'activity.actions.operatorCreated',
  'operator.blocked': 'activity.actions.operatorBlocked',
  'operator.unblocked': 'activity.actions.operatorUnblocked',
} as const satisfies Record<ActivityAction, string>;

const valueOf = (event: Event): string | null => {
  const value = (event.target as HTMLSelectElement).value;
  return value === '' ? null : value;
};

/**
 * Audit log (`/audit`; P8 design, artboards Audit and MobileAr): the Company owner's browser of SIMULATED
 * administrative activity, with a permanent "not Core audit evidence" note in every state. Platform and Organization
 * events are filtered by the URL's Platform, Organization and action; Company events are their own section, shown only
 * when no Platform or Organization is selected. An Organization's detail links here with it preselected. No export, no
 * audit-only field, nothing to change.
 */
@Component({
  selector: 'adm-activity-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDataState,
    NwDatePipe,
    NwFormField,
    NwIcon,
    NwNumberPipe,
  ],
  templateUrl: './activity.page.html',
  styleUrl: './activity.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'activity' },
})
export class ActivityPage {
  protected readonly facade = inject(ActivityFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly actions = ACTIVITY_ACTIONS;
  protected readonly actionKeys = ACTION_KEYS;
  protected readonly organizationPath = organizationPath;
  protected readonly platformPath = platformPath;

  /** Names by id, from the loaded hierarchy (user data: never translated). */
  protected readonly names = computed(() => {
    const view = this.facade.view();
    const platforms = new Map<string, string>();
    const organizations = new Map<string, string>();
    if (view.status === 'ready') {
      for (const p of view.activity.platforms) platforms.set(p.id, p.name);
      for (const o of view.activity.organizations) organizations.set(o.id, o.name);
    }
    return { platforms, organizations };
  });

  /** The selected Platform's Organizations, by name (the Organization filter's options). */
  protected readonly organizationOptions = computed(() => {
    const view = this.facade.view();
    const platform = this.facade.query().platform;
    if (view.status !== 'ready' || platform === null) return [];
    return view.activity.organizations
      .filter((o) => o.platformId === platform)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  protected readonly visible = computed(() => this.facade.entries().slice(0, this.facade.shown()));

  protected onPlatform(event: Event): void {
    this.facade.setQuery({ platform: valueOf(event) });
  }

  protected onOrganization(event: Event): void {
    this.facade.setQuery({ organization: valueOf(event) });
  }

  protected onAction(event: Event): void {
    const value = valueOf(event);
    this.facade.setQuery({
      action:
        value !== null && (ACTIVITY_ACTIONS as readonly string[]).includes(value)
          ? (value as ActivityAction)
          : null,
    });
  }

  protected clear(): void {
    this.facade.setQuery({ platform: null, organization: null, action: null });
  }
}
