import { BreakpointObserver } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet, UrlSerializer } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { Sidebar } from '../sidebar/sidebar';
import { TopBar } from '../top-bar/top-bar';

/** Below the `laptop` breakpoint (docs/ARCHITECTURE.md §15, abstracts/_breakpoints.scss) navigation is a drawer. */
export const DRAWER_QUERY = '(max-width: 56.24em)';

/** The page a URL shows: its path, without query parameters or fragment. */
export function pageOf(serializer: UrlSerializer, url: string): string {
  const tree = serializer.parse(url);
  tree.queryParams = {};
  tree.fragment = null;
  return serializer.serialize(tree);
}

/**
 * The application shell (docs/ARCHITECTURE.md §15, §25): skip link, sidebar (a drawer on narrow and tablet
 * viewports), top bar and the `main` landmark. On a change of page focus moves to `main` so the new page is read from
 * its heading (not when only query parameters change), and the drawer closes.
 */
@Component({
  selector: 'adm-shell',
  imports: [RouterOutlet, TranslocoPipe, Sidebar, TopBar],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'shell',
    '[class.shell--drawer]': 'drawerMode()',
    '[class.shell--drawer-open]': 'drawerMode() && drawerOpen()',
    '(document:keydown.escape)': 'onEscape($event)',
  },
})
export class Shell {
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly serializer = inject(UrlSerializer);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');
  private readonly sidebar = viewChild.required(Sidebar, { read: ElementRef });
  private readonly topBar = viewChild.required(TopBar);

  protected readonly drawerMode = toSignal(
    inject(BreakpointObserver)
      .observe(DRAWER_QUERY)
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  protected readonly drawerOpen = signal(false);

  constructor() {
    let path: string | null = null;
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        this.drawerOpen.set(false);
        // The first page load keeps the browser's natural focus; later navigations move focus to the new page. A change
        // of query parameters only (a tab, a filter, a sort) stays on the same page, so focus stays on its control.
        const next = pageOf(this.serializer, event.urlAfterRedirects);
        if (path !== null && next !== path)
          this.main().nativeElement.focus({ preventScroll: true });
        path = next;
      });

    // Leaving drawer mode (resize) never leaves an invisible drawer "open".
    effect(() => {
      if (!this.drawerMode()) this.drawerOpen.set(false);
    });
  }

  protected openDrawer(): void {
    this.drawerOpen.set(true);
    // Focus the first navigation link once the drawer is rendered and no longer inert.
    afterNextRender(
      () =>
        (this.sidebar().nativeElement as HTMLElement)
          .querySelector<HTMLElement>('nav a, nav button')
          ?.focus(),
      { injector: this.injector },
    );
  }

  /**
   * Escape closes the topmost thing only: when an overlay above the drawer (the account menu) has already handled it
   * (CDK menus `preventDefault` and close, returning focus to their trigger), the drawer stays open.
   */
  protected onEscape(event: Event): void {
    if (event.defaultPrevented) return;
    this.closeDrawer();
  }

  protected closeDrawer(): void {
    if (!this.drawerOpen()) return;
    this.drawerOpen.set(false);
    // The menu button is inert until the closed state renders.
    afterNextRender(() => this.topBar().focusMenuButton(), { injector: this.injector });
  }
}
