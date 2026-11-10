import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDialog } from '../../../shared/ui/dialog/dialog';
import { InvitationTarget } from '../application/admin-invitation.actions';
import { AdminInvitationsCard } from './admin-invitations-card/admin-invitations-card';

@Component({
  selector: 'adm-admin-invitations-panel',
  imports: [NwDialog, TranslocoPipe, AdminInvitationsCard],
  template: `
    <nw-dialog
      size="side"
      [title]="'organizations.invitations.title' | transloco"
      [closeLabel]="'common.close' | transloco"
    >
      <adm-admin-invitations-card
        [target]="data.target"
        [activeOnly]="data.activeOnly"
        [showCreate]="false"
      />
    </nw-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminInvitationsPanel {
  protected readonly data = inject<{ target: InvitationTarget; activeOnly: boolean }>(DIALOG_DATA);
}
