import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../../core/auth/auth-session';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/**
 * The header of the operator pages (P6 design): mark, eyebrow, title, a projected description line (`[headerMeta]`),
 * the demo badge and projected actions (`[headerActions]`). The title may be an operator's contact: `contact` writes it
 * left to right, isolated, and never translated.
 */
@Component({
  selector: 'header[adm-operators-header]',
  imports: [TranslocoPipe, NwIcon],
  template: `
    <span class="operators-header__mark" aria-hidden="true">
      <nw-icon name="shield-check" size="lg" />
    </span>
    <div class="operators-header__titles">
      <p class="operators-header__eyebrow">{{ eyebrow() }}</p>
      <h1 class="operators-header__title">
        @if (contact()) {
          <bdi dir="ltr" translate="no">{{ heading() }}</bdi>
        } @else {
          {{ heading() }}
        }
      </h1>
      <ng-content select="[headerMeta]" />
    </div>
    <div class="operators-header__actions">
      @if (isDemo()) {
        <span class="operators-header__demo">
          <nw-icon name="flask-conical" size="sm" />{{ 'shell.demo.badge' | transloco }}
          <span class="nw-visually-hidden">: {{ 'operators.demoExplanation' | transloco }}</span>
        </span>
      }
      <ng-content select="[headerActions]" />
    </div>
  `,
  styleUrl: './operators-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'operators-header' },
})
export class OperatorsHeader {
  protected readonly isDemo = inject(AuthSession).isDemo;
  readonly eyebrow = input.required<string>();
  readonly heading = input.required<string>();
  /** The heading is a contact (an email or a phone). */
  readonly contact = input(false);
}
