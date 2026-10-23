import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../../core/auth/auth-session';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/**
 * The header of the Organization pages (P3a design): mark, eyebrow, title, a projected description line
 * (`[headerMeta]`), the demo badge and projected actions (`[headerActions]`). Eyebrow and title are already translated
 * or are user data; both are isolated (`bdi`), as an Organization or Platform name may be either direction.
 */
@Component({
  selector: 'header[adm-organizations-header]',
  imports: [TranslocoPipe, NwIcon],
  template: `
    <span class="organizations-header__mark" aria-hidden="true">
      <nw-icon name="building-2" size="lg" />
    </span>
    <div class="organizations-header__titles">
      <p class="organizations-header__eyebrow">
        <bdi>{{ eyebrow() }}</bdi>
      </p>
      <h1 class="organizations-header__title">
        <bdi>{{ heading() }}</bdi>
      </h1>
      <ng-content select="[headerMeta]" />
    </div>
    <div class="organizations-header__actions">
      @if (isDemo()) {
        <span class="organizations-header__demo">
          <nw-icon name="flask-conical" size="sm" />{{ 'shell.demo.badge' | transloco }}
          <span class="nw-visually-hidden">: {{ 'shell.demo.explanation' | transloco }}</span>
        </span>
      }
      <ng-content select="[headerActions]" />
    </div>
  `,
  styleUrl: './organizations-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'organizations-header' },
})
export class OrganizationsHeader {
  protected readonly isDemo = inject(AuthSession).isDemo;
  readonly eyebrow = input.required<string>();
  readonly heading = input.required<string>();
}
