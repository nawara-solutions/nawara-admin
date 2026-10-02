import {
  ChangeDetectionStrategy,
  booleanAttribute,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
} from '@angular/core';

export type NwButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type NwButtonSize = 'sm' | 'md' | 'lg';

/**
 * Button styling on the native element, so semantics stay native: `<button nw-button>` for actions,
 * `<a nw-button routerLink>` for navigation (docs/ARCHITECTURE.md §25). Owns no copy; put an `nw-icon` before or after
 * the label as needed.
 *
 * Disabled: use the native `disabled` attribute on a `<button>`. A link has no `disabled`, so set
 * `aria-disabled="true"`: it stays focusable (and is announced as unavailable) but neither click nor Enter activates it.
 *
 * Busy: set `busy` and `aria-disabled="true"` together, and put an `nw-spinner` and the busy label inside. The button
 * keeps its colours and stays focusable, and repeated activation is ignored (docs/ARCHITECTURE.md §22).
 */
@Component({
  selector: 'button[nw-button], a[nw-button]',
  template: '<ng-content />',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nw-button',
    '[class.nw-button--primary]': "variant() === 'primary'",
    '[class.nw-button--secondary]': "variant() === 'secondary'",
    '[class.nw-button--ghost]': "variant() === 'ghost'",
    '[class.nw-button--danger]': "variant() === 'danger'",
    '[class.nw-button--sm]': "size() === 'sm'",
    '[class.nw-button--lg]': "size() === 'lg'",
    '[class.nw-button--busy]': 'busy()',
  },
})
export class NwButton {
  readonly variant = input<NwButtonVariant>('primary');
  readonly size = input<NwButtonSize>('md');
  readonly busy = input(false, { transform: booleanAttribute });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // Capture phase: runs before the consumer's own (click) and before RouterLink, so nothing activates.
    const block = (event: Event) => {
      if (host.getAttribute('aria-disabled') !== 'true') return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    host.addEventListener('click', block, { capture: true });
    inject(DestroyRef).onDestroy(() => host.removeEventListener('click', block, { capture: true }));
  }
}
