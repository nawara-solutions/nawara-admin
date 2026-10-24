import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import {
  PlatformActivityAction,
  PlatformActivityEntry,
} from '../../domain/platform-dashboard.model';

const ACTIONS = {
  'platform.created': { icon: 'hexagon', key: 'platformDashboard.activity.platformCreated' },
  'organization.created': {
    icon: 'building-2',
    key: 'platformDashboard.activity.organizationCreated',
  },
  'organization.updated': {
    icon: 'pencil',
    key: 'platformDashboard.activity.organizationUpdated',
  },
  'admin_invitation.created': {
    icon: 'mail',
    key: 'platformDashboard.activity.adminInvitationCreated',
  },
  'admin_invitation.revoked': {
    icon: 'circle-x',
    key: 'platformDashboard.activity.adminInvitationRevoked',
  },
  'membership.approved': {
    icon: 'user-plus',
    key: 'platformDashboard.activity.membershipApproved',
  },
  'membership.rejected': {
    icon: 'circle-x',
    key: 'platformDashboard.activity.membershipRejected',
  },
  'membership.revoked': {
    icon: 'shield-off',
    key: 'platformDashboard.activity.membershipRevoked',
  },
  'organization.admin.granted': {
    icon: 'shield-check',
    key: 'platformDashboard.activity.adminGranted',
  },
  'organization.admin.revoked': {
    icon: 'shield-off',
    key: 'platformDashboard.activity.adminRemoved',
  },
  'operator.assigned': { icon: 'shield-check', key: 'platformDashboard.activity.operatorAssigned' },
  'operator.unassigned': {
    icon: 'shield-off',
    key: 'platformDashboard.activity.operatorUnassigned',
  },
} as const satisfies Record<
  PlatformActivityAction,
  { readonly icon: NwIconName; readonly key: string }
>;

/** The owner's recent administrative activity on one Platform, newest first, with relative times. */
@Component({
  selector: 'adm-platform-activity',
  imports: [TranslocoPipe, NwDatePipe, NwIcon],
  templateUrl: './platform-activity.html',
  styleUrl: './platform-activity.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platform-activity' },
})
export class PlatformActivity {
  readonly entries = input.required<readonly PlatformActivityEntry[]>();
  protected readonly actions = ACTIONS;
}
