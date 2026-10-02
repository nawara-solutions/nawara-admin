import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { ActivityAction, ActivityEntry } from '../../domain/company-overview.model';

const ACTIONS = {
  'organization.created': {
    icon: 'store',
    accent: 'pink',
    labelKey: 'companyOverview.activity.actions.organizationCreated',
  },
  'operator.assigned': {
    icon: 'user-plus',
    accent: 'purple',
    labelKey: 'companyOverview.activity.actions.operatorAssigned',
  },
  'admin_invitation.sent': {
    icon: 'send',
    accent: 'orange',
    labelKey: 'companyOverview.activity.actions.invitationSent',
  },
  'license.renewed': {
    icon: 'badge-check',
    accent: 'green',
    labelKey: 'companyOverview.activity.actions.licenseRenewed',
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
