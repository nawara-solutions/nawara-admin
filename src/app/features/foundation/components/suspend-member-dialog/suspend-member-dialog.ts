import { DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';

/** Example destructive confirmation for the A2 preview. Resolves `true` when confirmed. */
@Component({
  selector: 'adm-suspend-member-dialog',
  imports: [TranslocoPipe, NwButton, NwDialog],
  template: `
    <nw-dialog
      [title]="'foundation.overlays.dialogTitle' | transloco"
      [closeLabel]="'common.close' | transloco"
    >
      <p>{{ 'foundation.overlays.dialogBody' | transloco }}</p>
      <div nwDialogActions>
        <button nw-button variant="ghost" type="button" (click)="ref.close(false)">
          {{ 'foundation.actions.cancel' | transloco }}
        </button>
        <button nw-button variant="danger" type="button" (click)="ref.close(true)">
          {{ 'foundation.overlays.confirm' | transloco }}
        </button>
      </div>
    </nw-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuspendMemberDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}
