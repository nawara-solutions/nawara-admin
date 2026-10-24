import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { ActivityAction, ActivityEntry } from '../../domain/company-overview.model';

const ACTIONS = {
  'platform.created': {
    icon: 'hexagon',
    accent: 'pink',
    labelKey: 'companyOverview.activity.actions.platformCreated',
  },
  'organization.created': {
    icon: 'store',
    accent: 'pink',
    labelKey: 'companyOverview.activity.actions.organizationCreated',
  },
  'organization.updated': {
    icon: 'pencil',
    accent: 'pink',
    labelKey: 'companyOverview.activity.actions.organizationUpdated',
  },
  'operator.assigned': {
    icon: 'user-plus',
    accent: 'purple',
    labelKey: 'companyOverview.activity.actions.operatorAssigned',
  },
  'operator.unassigned': {
    icon: 'shield-off',
    accent: 'purple',
    labelKey: 'companyOverview.activity.actions.operatorUnassigned',
  },
  'operator.blocked': {
    icon: 'lock-keyhole',
    accent: 'orange',
    labelKey: 'companyOverview.activity.actions.operatorBlocked',
  },
  'operator.unblocked': {
    icon: 'shield-check',
    accent: 'green',
    labelKey: 'companyOverview.activity.actions.operatorUnblocked',
  },
  'admin_invitation.created': {
    icon: 'mail',
    accent: 'orange',
    labelKey: 'companyOverview.activity.actions.invitationCreated',
  },
  'admin_invitation.revoked': {
    icon: 'circle-x',
    accent: 'orange',
    labelKey: 'companyOverview.activity.actions.invitationRevoked',
  },
  'membership.approved': {
    icon: 'badge-check',
    accent: 'green',
    labelKey: 'companyOverview.activity.actions.membershipApproved',
  },
  'membership.rejected': {
    icon: 'circle-x',
    accent: 'orange',
    labelKey: 'companyOverview.activity.actions.membershipRejected',
  },
  'membership.revoked': {
    icon: 'shield-off',
    accent: 'orange',
    labelKey: 'companyOverview.activity.actions.membershipRevoked',
  },
  'organization.admin.granted': {
    icon: 'shield-check',
    accent: 'green',
    labelKey: 'companyOverview.activity.actions.adminGranted',
  },
  'organization.admin.revoked': {
    icon: 'shield-off',
    accent: 'orange',
    labelKey: 'companyOverview.activity.actions.adminRemoved',
  },
} as const satisfies Record<
  ActivityAction,
  { icon: NwIconName; accent: 'pink' | 'purple' | 'orange' | 'green'; labelKey: string }
>;

/**
 * "Recent activity", newest first, with relative times ("2 hours ago"). Names are user data: isolated, never
 * translated.
 */
@Component({
  selector: 'adm-activity-list',
  imports: [TranslocoPipe, NwDatePipe, NwIcon],
  templateUrl: './activity-list.html',
  styleUrl: './activity-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'activity-list' },
})
export class ActivityList {
  readonly entries = input.required<readonly ActivityEntry[]>();
  protected readonly actions = ACTIONS;
}
