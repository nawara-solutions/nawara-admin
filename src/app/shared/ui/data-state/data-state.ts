import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NwIcon } from '../icon/icon';
import { NwSkeleton } from '../skeleton/skeleton';

export type NwDataStateKind = 'loading' | 'empty' | 'error';

/**
 * Loading, empty and error states with one look everywhere (docs/ARCHITECTURE.md §20). Loading is announced through
 * a status region; errors through an alert. Actions (retry, create) are projected with `<div nwDataStateActions>`.
 */
@Component({
  selector: 'nw-data-state',
  imports: [NwIcon, NwSkeleton],
  templateUrl: './data-state.html',
  styleUrl: './data-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nw-data-state', '[class.nw-data-state--error]': "state() === 'error'" },
})
export class NwDataState {
  readonly state = input.required<NwDataStateKind>();
  /** Localized title; for `loading` it is the announced text (visually hidden). */
  readonly title = input.required<string>();
  readonly description = input<string>();

  protected readonly icon = computed(() => (this.state() === 'error' ? 'circle-alert' : 'inbox'));
}
