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
  'organization.created': {
    icon: 'building-2',
    key: 'platformDashboard.activity.organizationCreated',
  },
  'admin_invitation.sent': { icon: 'send', key: 'platformDashboard.activity.adminInvitationSent' },
  'membership.approved': {
    icon: 'user-plus',
    key: 'platformDashboard.activity.membershipApproved',
  },
  'operator.assigned': { icon: 'shield-check', key: 'platformDashboard.activity.operatorAssigned' },
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
