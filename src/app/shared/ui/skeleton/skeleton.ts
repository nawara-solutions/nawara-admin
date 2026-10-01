import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Loading placeholder. Hidden from assistive technology; the surrounding `nw-data-state` announces loading. */
@Component({
  selector: 'nw-skeleton',
  template: `@for (line of lineList(); track line) {
    <span class="nw-skeleton__line"></span>
  }`,
  styleUrl: './skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nw-skeleton',
    'aria-hidden': 'true',
    '[class.nw-skeleton--block]': "shape() === 'block'",
  },
})
export class NwSkeleton {
  readonly lines = input(1);
  readonly shape = input<'text' | 'block'>('text');
  protected readonly lineList = computed(() =>
    Array.from({ length: this.shape() === 'block' ? 1 : this.lines() }, (_, i) => i),
  );
}
