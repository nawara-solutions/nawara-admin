import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NwIcon } from '../icon/icon';
import { NwIconName } from '../icon/icon.registry';

export type NwInlineAlertTone = 'danger' | 'warning' | 'info' | 'success';

const TONE_ICONS = {
  danger: 'circle-alert',
  warning: 'triangle-alert',
  info: 'info',
  success: 'circle-check',
} as const satisfies Record<NwInlineAlertTone, NwIconName>;

/**
 * A message inside a card or form, above the content it concerns (docs/ARCHITECTURE.md §20, §25). Danger and warning
 * are `role="alert"` (announced at once); info and success are `role="status"` (polite). The tone is carried by the
 * icon and the text, never by colour alone. Owns no copy: the message is projected, the action label is an input.
 */
@Component({
  selector: 'nw-inline-alert',
  imports: [NwIcon],
  template: `
    <nw-icon class="nw-inline-alert__icon" [name]="icon() ?? defaultIcon()" />
    <div class="nw-inline-alert__body">
      <div class="nw-inline-alert__message"><ng-content /></div>
      @if (actionLabel(); as label) {
        <button type="button" class="nw-inline-alert__action" (click)="action.emit()">
          @if (actionIcon(); as name) {
            <nw-icon [name]="name" size="sm" />
          }
          <span>{{ label }}</span>
        </button>
      }
    </div>
  `,
  styleUrl: './inline-alert.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nw-inline-alert',
    '[class.nw-inline-alert--danger]': "tone() === 'danger'",
    '[class.nw-inline-alert--warning]': "tone() === 'warning'",
    '[class.nw-inline-alert--success]': "tone() === 'success'",
    '[attr.role]': "tone() === 'danger' || tone() === 'warning' ? 'alert' : 'status'",
  },
})
export class NwInlineAlert {
  readonly tone = input<NwInlineAlertTone>('info');
  /** Replaces the tone's default icon. */
  readonly icon = input<NwIconName>();
  /** Shows an action button below the message (for example "Try again"). */
  readonly actionLabel = input<string>();
  readonly actionIcon = input<NwIconName>();
  readonly action = output<void>();

  protected readonly defaultIcon = computed(() => TONE_ICONS[this.tone()]);
}
