import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwNumberPipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { AttentionView, AttentionViewItem } from '../../application/company-overview.facade';

const KINDS = {
  admin_invitations_awaiting: {
    icon: 'mail',
    accent: 'orange',
    urgent: false,
    titleKey: 'companyOverview.attention.adminInvitations.title',
    descriptionKey: 'companyOverview.attention.adminInvitations.description',
  },
  access_assignments_to_review: {
    icon: 'user-cog',
    accent: 'purple',
    urgent: false,
    titleKey: 'companyOverview.attention.accessAssignments.title',
    descriptionKey: 'companyOverview.attention.accessAssignments.description',
  },
  licenses_expiring: {
    icon: 'key-round',
    accent: 'pink',
    urgent: true,
    titleKey: 'companyOverview.attention.licensesExpiring.title',
    descriptionKey: 'companyOverview.attention.licensesExpiring.description',
  },
} as const satisfies Record<
  AttentionView,
  {
    icon: NwIconName;
    accent: 'orange' | 'purple' | 'pink';
    urgent: boolean;
    titleKey: string;
    descriptionKey: string;
  }
>;

/**
 * "Needs attention". Informational in this slice: the pages these items lead to are not built, so they are not links
 * (the design's row chevrons are left out). The count is a separate figure, so the copy needs no plural forms.
 * Expiring licenses are marked urgent (owner design).
 */
@Component({
  selector: 'adm-attention-list',
  imports: [TranslocoPipe, NwNumberPipe, NwIcon],
  templateUrl: './attention-list.html',
  styleUrl: './attention-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'attention-list' },
})
export class AttentionList {
  readonly items = input.required<readonly AttentionViewItem[]>();
  protected readonly kinds = KINDS;
}
