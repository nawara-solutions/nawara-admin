import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/**
 * The miniature page inside the Accordions settings preview (WP-5.2b): a decorative sidebar and page showing which
 * sections the person's choices keep visible. It renders inside the page's own `.accordion-settings__mock-shell`
 * element, which keeps its layout; the stylesheet carries the page's former rules for this content unchanged.
 * Presentation only: it reads the page's current, unsaved choices and stores nothing.
 */
@Component({
  selector: 'div[adm-accordion-mock-shell]',
  imports: [NwIcon, TranslocoPipe],
  templateUrl: './accordion-mock-shell.html',
  styleUrl: './accordion-mock-shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccordionMockShell {
  readonly variant = input.required<'dashboard' | 'operators'>({
    alias: 'adm-accordion-mock-shell',
  });
  /** Dashboard: the Platform figures are shown. */
  readonly figures = input(false);
  /** Dashboard: the subscriptions overview is shown. */
  readonly subscriptions = input(false);
  /** Operators: the access totals are shown. */
  readonly totals = input(false);
}
