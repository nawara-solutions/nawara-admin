import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwStatusBadge, NwStatusTone } from '../../../../shared/ui/status-badge/status-badge';
import {
  CreateAdminInvitationAction,
  InvitationTarget,
  RevokeAdminInvitationAction,
} from '../../application/admin-invitation.actions';
import { AdminInvitationsFacade } from '../../application/admin-invitations.facade';
import {
  AdminInvitation,
  AdminInvitationStatus,
  creatorOf,
} from '../../domain/admin-invitation.model';

/** Catalog keys and tones, listed in full (never built at runtime). */
const STATUS = {
  active: { tone: 'success', key: 'organizations.invitations.status.active' },
  consumed: { tone: 'info', key: 'organizations.invitations.status.consumed' },
  revoked: { tone: 'danger', key: 'organizations.invitations.status.revoked' },
  expired: { tone: 'warning', key: 'organizations.invitations.status.expired' },
} as const satisfies Record<
  AdminInvitationStatus,
  { readonly tone: NwStatusTone; readonly key: string }
>;

const CREATOR_KEYS = {
  you: 'organizations.invitations.list.byYou',
  someoneElse: 'organizations.invitations.list.bySomeoneElse',
} as const;

/**
 * "Organization admin invitations" (P3b-S3 design, artboard 1), the owner's only: the Organization's invitations as
 * Core lists them (newest first, metadata only: never a code or a contact), "Create invitation", and "Revoke" on active
 * invitations. Each status is said in words, not by colour alone. After a create whose answer was lost, invitations
 * that MAY come from it are marked as such, never as a proven match.
 */
@Component({
  selector: 'adm-admin-invitations-card',
  imports: [TranslocoPipe, NwButton, NwDatePipe, NwIcon, NwStatusBadge],
  templateUrl: './admin-invitations-card.html',
  styleUrl: './admin-invitations-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'admin-invitations',
    role: 'region',
    'aria-labelledby': 'admin-invitations-title',
  },
})
export class AdminInvitationsCard {
  protected readonly facade = inject(AdminInvitationsFacade);
  protected readonly createAction = inject(CreateAdminInvitationAction);
  protected readonly revokeAction = inject(RevokeAdminInvitationAction);
  private readonly injector = inject(Injector);

  /** The Organization shown by the detail page. */
  readonly target = input.required<InvitationTarget>();

  protected readonly status = STATUS;
  protected readonly creatorKeys = CREATOR_KEYS;
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  constructor() {
    let handled = 0;
    effect(() => {
      const requests = this.facade.focusRequests();
      if (requests === handled) return;
      handled = requests;
      afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.injector });
    });
  }

  protected creator(invitation: AdminInvitation) {
    return CREATOR_KEYS[creatorOf(invitation, this.facade.userId())];
  }

  protected create(): void {
    this.createAction.open(this.target());
  }

  protected revoke(invitation: AdminInvitation): void {
    this.revokeAction.open({ target: this.target(), invitation });
  }
}
