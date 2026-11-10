import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDialog } from '../../../shared/ui/dialog/dialog';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { Membership, memberIdentity } from '../domain/membership.model';

export interface MemberDetailPanelData {
  member: () => Membership | undefined;
  role: (member: Membership) => 'grant' | 'remove' | null;
  canRevoke: (member: Membership) => boolean;
  changeRole: (member: Membership, admin: boolean) => void;
  revoke: (member: Membership) => void;
}

@Component({
  selector: 'adm-member-detail-panel',
  imports: [TranslocoPipe, NwDatePipe, NwButton, NwDialog, NwIcon],
  template: `
    <nw-dialog size="side" [title]="title()" [closeLabel]="'common.close' | transloco">
      @if (member(); as m) {
        <section class="details" aria-labelledby="member-facts">
          <h3 id="member-facts" class="nw-visually-hidden">
            {{ 'organizations.members.detail.facts' | transloco }}
          </h3>
          <dl>
            <div>
              <dt>{{ 'organizations.members.detail.status' | transloco }}</dt>
              <dd>
                <span
                  class="status"
                  [class.status--pending]="m.status === 'pending'"
                  [class.status--rejected]="m.status === 'rejected'"
                  >{{ statusKey() | transloco }}</span
                >
              </dd>
            </div>
            <div>
              <dt>{{ 'organizations.members.table.role' | transloco }}</dt>
              <dd>
                {{
                  (m.isOrganizationAdmin
                    ? 'organizations.members.role.admin'
                    : 'organizations.members.role.member'
                  ) | transloco
                }}
              </dd>
            </div>
            <div>
              <dt>{{ 'organizations.members.table.audience' | transloco }}</dt>
              <dd>
                <bdi dir="ltr">{{ m.audience }}</bdi>
              </dd>
            </div>
            @if (m.email && m.email !== title()) {
              <div>
                <dt>{{ 'organizations.members.detail.email' | transloco }}</dt>
                <dd>
                  <bdi dir="ltr">{{ m.email }}</bdi>
                </dd>
              </div>
            }
            @if (m.phone && m.phone !== title()) {
              <div>
                <dt>{{ 'organizations.members.detail.phone' | transloco }}</dt>
                <dd>
                  <bdi dir="ltr">{{ m.phone }}</bdi>
                </dd>
              </div>
            }
            <div>
              <dt>{{ 'organizations.members.detail.contact' | transloco }}</dt>
              <dd class="verification">
                <nw-icon [name]="m.contactVerified ? 'badge-check' : 'circle-alert'" size="sm" />
                {{
                  (m.contactVerified
                    ? 'organizations.members.identity.verified'
                    : 'organizations.members.identity.unverified'
                  ) | transloco
                }}
              </dd>
            </div>
            <div>
              <dt>{{ 'organizations.members.table.requested' | transloco }}</dt>
              <dd>{{ m.requestedAt | nwDate: 'date-time' }}</dd>
            </div>
            @if (m.approvedAt) {
              <div>
                <dt>{{ 'organizations.members.table.activeSince' | transloco }}</dt>
                <dd>{{ m.approvedAt | nwDate: 'date-time' }}</dd>
              </div>
            }
            @if (m.rejectedAt) {
              <div>
                <dt>{{ 'organizations.members.table.rejected' | transloco }}</dt>
                <dd>{{ m.rejectedAt | nwDate: 'date-time' }}</dd>
              </div>
            }
          </dl>
        </section>
        @if (data.role(m) || data.canRevoke(m)) {
          <section class="details manage">
            <h3>{{ 'organizations.members.revoke.cardTitle' | transloco }}</h3>
            <div class="actions">
              @if (data.role(m); as change) {
                <button
                  nw-button
                  variant="secondary"
                  type="button"
                  (click)="data.changeRole(m, change === 'grant')"
                >
                  <nw-icon name="user-cog" size="sm" />
                  {{
                    (change === 'grant'
                      ? 'organizations.members.role.grantOpen'
                      : 'organizations.members.role.removeOpen'
                    ) | transloco
                  }}
                </button>
              }
              @if (data.canRevoke(m)) {
                <button
                  nw-button
                  variant="ghost"
                  type="button"
                  class="danger"
                  (click)="data.revoke(m)"
                >
                  <nw-icon name="user-minus" size="sm" />{{
                    'organizations.members.revoke.open' | transloco
                  }}
                </button>
              }
            </div>
          </section>
        }
      }
    </nw-dialog>
  `,
  styles: `
    .details {
      margin-block-end: 1.5rem;
      padding: 0;
    }
    .manage {
      padding-block-start: var(--nw-space-5);
      border-block-start: 1px solid var(--nw-border-subtle);
    }
    .status {
      display: inline-flex;
      padding: var(--nw-space-1) var(--nw-space-2);
      border-radius: var(--nw-radius-pill);
      background: var(--nw-status-success-bg);
      color: var(--nw-status-success-fg);
      font-size: var(--nw-text-size-xs);
    }
    .status--pending {
      background: var(--nw-status-warning-bg);
      color: var(--nw-status-warning-fg);
    }
    .status--rejected {
      background: var(--nw-status-danger-bg);
      color: var(--nw-status-danger-fg);
    }
    .verification {
      display: flex;
      align-items: center;
      gap: var(--nw-space-2);
    }
    h3 {
      margin: 0 0 1rem;
      color: var(--nw-text-primary);
      font-size: var(--nw-text-size-md);
      font-weight: var(--nw-font-weight-semibold);
    }
    dl {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      margin: 0;
    }
    dl div {
      display: grid;
      grid-template-columns: minmax(7rem, 1fr) minmax(0, 1.6fr);
      align-items: center;
      gap: var(--nw-space-4);
      min-inline-size: 0;
      padding: var(--nw-space-4) var(--nw-space-3);
      border-block-end: 1px solid var(--nw-border-subtle);
    }
    dl div:nth-child(-n + 2) {
      background: var(--nw-surface-sunken);
      border-block-end: 0;
    }
    dl div:first-child {
      border-start-start-radius: var(--nw-radius-md);
      border-start-end-radius: var(--nw-radius-md);
    }
    dl div:nth-child(2) {
      border-end-start-radius: var(--nw-radius-md);
      border-end-end-radius: var(--nw-radius-md);
      margin-block-end: var(--nw-space-3);
    }
    dl div:last-child {
      border-block-end: 0;
    }
    dt {
      margin: 0;
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-xs);
    }
    dd {
      margin: 0;
      color: var(--nw-text-primary);
      font-size: var(--nw-text-size-sm);
      font-weight: var(--nw-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }
    .danger {
      --nw-button-fg: var(--nw-status-danger-fg);
    }
    @media (max-width: 30rem) {
      dl div {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--nw-space-2);
      }
      .actions > button {
        inline-size: 100%;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MemberDetailPanel {
  protected readonly data = inject<MemberDetailPanelData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  protected readonly member = computed(() => this.data.member());
  protected readonly title = computed(() => {
    const member = this.member();
    if (!member) return '';
    return memberIdentity(member).value;
  });
  protected readonly statusKey = computed(() => {
    switch (this.member()?.status) {
      case 'pending':
        return 'organizations.members.detail.statusPending';
      case 'rejected':
        return 'organizations.members.status.rejected';
      default:
        return 'organizations.members.status.active';
    }
  });
  constructor() {
    effect(() => {
      if (!this.member()) this.ref.close();
    });
  }
}
