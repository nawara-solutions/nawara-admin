import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../../core/auth/auth-session';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import {
  OrganizationActivityAction,
  OrganizationActivityEntry,
} from '../../domain/organization.model';

const ACTIONS = {
  'organization.created': { icon: 'building-2', key: 'organizations.activity.organizationCreated' },
  'organization.updated': { icon: 'pencil', key: 'organizations.activity.organizationUpdated' },
  'admin_invitation.created': {
    icon: 'mail',
    key: 'organizations.activity.adminInvitationCreated',
  },
  'admin_invitation.revoked': {
    icon: 'circle-x',
    key: 'organizations.activity.adminInvitationRevoked',
  },
  'membership.approved': { icon: 'user-plus', key: 'organizations.activity.membershipApproved' },
} as const satisfies Record<
  OrganizationActivityAction,
  { readonly icon: NwIconName; readonly key: string }
>;

/**
 * The owner's recent administrative activity on one Organization, newest first, with relative times. In a demo build
 * every entry is the demo world's (fictional or made by a simulated command), and says so.
 */
@Component({
  selector: 'adm-organization-activity',
  imports: [TranslocoPipe, NwDatePipe, NwIcon],
  template: `
    @if (entries().length > 0) {
      <ol class="organization-activity__list">
        @for (entry of entries(); track entry.id) {
          <li class="organization-activity__event">
            <span class="organization-activity__icon" aria-hidden="true">
              <nw-icon [name]="actions[entry.action].icon" size="sm" />
            </span>
            <span class="organization-activity__text">
              <span class="organization-activity__label">{{
                actions[entry.action].key | transloco
              }}</span>
              <span class="organization-activity__time">
                <time [attr.datetime]="entry.occurredAt">{{
                  entry.occurredAt | nwDate: 'relative'
                }}</time>
                @if (isDemo()) {
                  · {{ 'organizations.activity.simulated' | transloco }}
                }
              </span>
            </span>
          </li>
        }
      </ol>
      <p class="organization-activity__note">
        {{ 'organizations.detail.activityNote' | transloco }}
      </p>
    } @else {
      <p class="organization-activity__note">
        {{ 'organizations.detail.activityEmpty' | transloco }}
      </p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--nw-space-3);
    }

    .organization-activity__list {
      display: grid;
      gap: var(--nw-space-3);
    }

    .organization-activity__event {
      display: flex;
      align-items: flex-start;
      gap: var(--nw-space-3);
    }

    .organization-activity__icon {
      display: inline-grid;
      flex: none;
      place-items: center;
      inline-size: 2rem;
      block-size: 2rem;
      border-radius: var(--nw-radius-pill);
      background-color: var(--nw-accent-orange-bg);
      color: var(--nw-accent-orange-fg);
    }

    .organization-activity__text {
      display: grid;
    }

    .organization-activity__label {
      font-size: var(--nw-text-size-sm);
      font-weight: var(--nw-font-weight-semibold);
    }

    .organization-activity__time,
    .organization-activity__note {
      color: var(--nw-text-secondary);
      font-size: 0.78125rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'organization-activity' },
})
export class OrganizationActivity {
  readonly entries = input.required<readonly OrganizationActivityEntry[]>();
  protected readonly actions = ACTIONS;
  protected readonly isDemo = inject(AuthSession).isDemo;
}
