import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NwIcon } from '../icon/icon';
import { NwIconName } from '../icon/icon.registry';

export type NwStatusTone = 'success' | 'warning' | 'danger' | 'info';

const TONE_ICONS = {
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-x',
  info: 'info',
} as const satisfies Record<NwStatusTone, NwIconName>;

/** Status as icon + text + colour; colour is never the only carrier of meaning (docs/ARCHITECTURE.md §25). */
@Component({
  selector: 'nw-status-badge',
  imports: [NwIcon],
  template:
    '<nw-icon [name]="icon()" size="sm" /><span class="nw-status-badge__label"><ng-content /></span>',
  styleUrl: './status-badge.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nw-status-badge',
    '[class.nw-status-badge--success]': "tone() === 'success'",
    '[class.nw-status-badge--warning]': "tone() === 'warning'",
    '[class.nw-status-badge--danger]': "tone() === 'danger'",
    '[class.nw-status-badge--info]': "tone() === 'info'",
  },
})
export class NwStatusBadge {
  readonly tone = input.required<NwStatusTone>();
  protected readonly icon = computed(() => TONE_ICONS[this.tone()]);
}
