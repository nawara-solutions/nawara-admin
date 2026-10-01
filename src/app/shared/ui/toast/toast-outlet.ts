import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NwIcon } from '../icon/icon';
import { NwIconName } from '../icon/icon.registry';
import { NwIconButton } from '../icon-button/icon-button';
import { NwStatusTone } from '../status-badge/status-badge';
import { NwToastService } from './toast.service';

const TONE_ICONS = {
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-x',
  info: 'info',
} as const satisfies Record<NwStatusTone, NwIconName>;

/**
 * Renders toasts in two persistent live regions: errors are assertive, everything else polite. Place once, in the
 * application shell.
 */
@Component({
  selector: 'nw-toast-outlet',
  imports: [NwIcon, NwIconButton],
  templateUrl: './toast-outlet.html',
  styleUrl: './toast-outlet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nw-toast-outlet' },
})
export class NwToastOutlet {
  readonly dismissLabel = input.required<string>();

  protected readonly service = inject(NwToastService);
  protected readonly icons = TONE_ICONS;
  protected readonly regions = computed(() => {
    const toasts = this.service.toasts();
    return [
      { live: 'assertive', toasts: toasts.filter((toast) => toast.tone === 'danger') },
      { live: 'polite', toasts: toasts.filter((toast) => toast.tone !== 'danger') },
    ] as const;
  });
}
