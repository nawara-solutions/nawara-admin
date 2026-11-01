import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  IsActiveMatchOptions,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { filter } from 'rxjs';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';

interface Section {
  readonly id: 'cases' | 'disputes' | 'settlements' | 'recovery';
  readonly path: string;
  readonly labelKey: string;
  readonly icon: NwIconName;
}

/** The four Assistance views, in the order an owner works through them (A11). Catalog keys listed in full. */
export const ASSISTANCE_SECTIONS: readonly Section[] = [
  {
    id: 'cases',
    path: '/billing/assistance',
    labelKey: 'assistanceCases.nav.cases',
    icon: 'clipboard-list',
  },
  {
    id: 'disputes',
    path: '/billing/assistance/disputes',
    labelKey: 'assistanceCases.nav.disputes',
    icon: 'circle-alert',
  },
  {
    id: 'settlements',
    path: '/billing/assistance/settlements',
    labelKey: 'assistanceCases.nav.settlements',
    icon: 'rotate-ccw',
  },
  {
    id: 'recovery',
    path: '/billing/assistance/recovery',
    labelKey: 'assistanceCases.nav.recovery',
    icon: 'trending-down',
  },
];

/** Active on its own page only, whatever its filters: the directory is never active on an overview or a case. */
const EXACT_PAGE: IsActiveMatchOptions = {
  paths: 'exact',
  queryParams: 'ignored',
  matrixParams: 'ignored',
  fragment: 'ignored',
};

/**
 * The Assistance section navigation (A11): one labelled `nav` landmark shared by the case directory and the three oversight views,
 * so every view reaches the others the same way. The current view is marked with `aria-current="page"`, a heavier label and an
 * underline (never colour alone). Each link opens its view's default; a view's own filters live in its address. It is not a second
 * sidebar entry: the global sidebar keeps one "Billing & payments" item, active on every Assistance page.
 */
@Component({
  selector: 'adm-assistance-section-nav',
  imports: [RouterLink, RouterLinkActive, TranslocoPipe, NwIcon],
  template: `
    <nav class="assistance-section-nav" [attr.aria-label]="'assistanceCases.nav.label' | transloco">
      <ul class="assistance-section-nav__list" role="list">
        @for (section of sections; track section.id) {
          <li>
            <a
              class="assistance-section-nav__link"
              [routerLink]="section.path"
              routerLinkActive="assistance-section-nav__link--active"
              [routerLinkActiveOptions]="exact"
              ariaCurrentWhenActive="page"
              [attr.data-section-link]="section.id"
            >
              <nw-icon [name]="section.icon" size="sm" />
              <span>{{ section.labelKey | transloco }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styleUrl: './assistance-section-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistanceSectionNav {
  protected readonly sections = ASSISTANCE_SECTIONS;
  protected readonly exact = EXACT_PAGE;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    // On a narrow screen the row scrolls: keep the current view visible in it (instantly, so reduced motion is respected).
    afterNextRender(() => this.revealCurrent());
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => setTimeout(() => this.revealCurrent()));
  }

  private revealCurrent(): void {
    const current = this.host.nativeElement.querySelector<HTMLElement>('[aria-current="page"]');
    if (current !== null && typeof current.scrollIntoView === 'function')
      current.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  }
}
