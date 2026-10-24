import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../../core/auth/auth-session';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/**
 * "Operator created. Next steps" (P6-S4 design, artboards Created and MobileAr), on the new operator's page right after
 * the owner created them: Core sends the one-time code (Admin never sees it), the operator confirms it at sign-in, then
 * the owner gives Platform access. The code cannot be resent (CF-16). In a demo build, where the code is the demo one
 * the sign-in page lists. Never shows a code or a contact.
 */
@Component({
  selector: 'section[adm-operator-created-panel]',
  imports: [TranslocoPipe, NwIcon],
  template: `
    <h2 id="operator-created-title" class="operator-created__title">
      {{ 'operators.create.nextTitle' | transloco }}
    </h2>
    <ol class="operator-created__steps">
      <li>{{ 'operators.create.nextCode' | transloco }}</li>
      <li>{{ 'operators.create.nextConfirm' | transloco }}</li>
      <li>{{ 'operators.create.nextAccess' | transloco }}</li>
    </ol>
    <p class="operator-created__note">
      <nw-icon name="hourglass" size="sm" />
      <span>{{ 'operators.create.nextNoResend' | transloco }}</span>
    </p>
    @if (isDemo()) {
      <p class="operator-created__demo" role="note">
        <nw-icon name="flask-conical" size="sm" />
        <span>{{ 'operators.create.nextDemo' | transloco }}</span>
      </p>
    }
  `,
  styleUrl: './operator-created-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'operator-created', 'aria-labelledby': 'operator-created-title' },
})
export class OperatorCreatedPanel {
  protected readonly isDemo = inject(AuthSession).isDemo;
}
