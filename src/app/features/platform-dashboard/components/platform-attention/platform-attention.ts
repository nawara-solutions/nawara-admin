import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import {
  PlatformAttentionItem,
  PlatformAttentionKind,
} from '../../application/platform-dashboard.facade';

const KINDS = {
  membership_requests: { icon: 'user-plus', key: 'platformDashboard.attention.membershipRequests' },
  admin_invitations: { icon: 'send', key: 'platformDashboard.attention.adminInvitations' },
  subscription_grace: { icon: 'hourglass', key: 'platformDashboard.attention.subscriptionGrace' },
  payment_issues: { icon: 'credit-card', key: 'platformDashboard.attention.paymentIssues' },
} as const satisfies Record<
  PlatformAttentionKind,
  { readonly icon: NwIconName; readonly key: string }
>;

/** "Needs attention" of one Platform: counts with their context; warnings (grace, payments) are tinted and say so. */
@Component({
  selector: 'adm-platform-attention',
  imports: [TranslocoPipe, NwDatePipe, NwIcon],
  templateUrl: './platform-attention.html',
  styleUrl: './platform-attention.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platform-attention' },
})
export class PlatformAttention {
  readonly items = input.required<readonly PlatformAttentionItem[]>();
  protected readonly kinds = KINDS;
}
