import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwButton, NwButtonVariant } from '../../../../shared/ui/button/button';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { CreateOrganizationAction } from '../../application/create-organization.action';

let nextId = 0;

/**
 * The "Create organization" entry point (P3b design, artboards 1 and 4): live for the owner; for an operator, or in a
 * build without the command, still shown but `aria-disabled`, with its reason as a tooltip it describes itself by
 * (focus or hover shows it). Nothing is rendered on a Platform the actor may not enter.
 */
@Component({
  selector: 'adm-create-organization-button',
  imports: [TranslocoPipe, NwButton, NwIcon],
  template: `
    @if (action.visible()) {
      @let reason = action.blockedKey();
      <button
        nw-button
        type="button"
        [variant]="variant()"
        [attr.aria-disabled]="reason ? 'true' : null"
        [attr.aria-describedby]="reason ? reasonId : null"
        (click)="action.open()"
      >
        <nw-icon name="plus" size="sm" />{{ 'organizations.create.open' | transloco }}
      </button>
      @if (reason) {
        <span [id]="reasonId" class="create-organization-button__reason" role="tooltip">{{
          reason | transloco
        }}</span>
      }
    }
  `,
  styleUrl: './create-organization-button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'create-organization-button' },
})
export class CreateOrganizationButton {
  protected readonly action = inject(CreateOrganizationAction);
  readonly variant = input<NwButtonVariant>('primary');
  protected readonly reasonId = `create-organization-reason-${nextId++}`;
}
