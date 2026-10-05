import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map, startWith } from 'rxjs';
import { can } from '../../core/access/capability-policy';
import { homePath } from '../../core/access/home-path';
import { AuthSession } from '../../core/auth/auth-session';
import { ScopeContext } from '../../core/context/scope-context';
import { NwIcon } from '../../shared/ui/icon/icon';

/** Route data key: the catalog key of the page's last breadcrumb ("Overview"). */
export const BREADCRUMB_DATA = 'breadcrumb';

interface Crumb {
  readonly label: string;
  readonly translate: boolean;
  readonly link?: string;
}

/**
 * Breadcrumbs follow the hierarchy Company → Platform (docs/ARCHITECTURE.md §7): "Company › Overview" in company
 * scope, "Company › Platforms › Nawara School" in platform scope (Platforms only for an owner, who has the directory). The last item is the current page.
 */
@Component({
  selector: 'adm-breadcrumbs',
  imports: [RouterLink, TranslocoPipe, NwIcon],
  templateUrl: './breadcrumbs.html',
  styleUrl: './breadcrumbs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'breadcrumbs' },
})
export class Breadcrumbs {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly context = inject(ScopeContext);
  private readonly session = inject(AuthSession);

  private readonly pageKey = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let route = this.route.snapshot;
        while (route.firstChild) route = route.firstChild;
        const key: unknown = route.data[BREADCRUMB_DATA];
        return typeof key === 'string' ? key : null;
      }),
    ),
    { initialValue: null },
  );

  private readonly companyScope = computed(() =>
    can(this.session.actor(), 'company.overview.view'),
  );

  /** The home icon goes to the actor's home, and is named for it: never the Company overview for an operator. */
  protected readonly home = computed(() => homePath(this.session.actor()));
  protected readonly homeLabel = computed(() =>
    this.companyScope() ? 'shell.breadcrumb.home' : 'shell.context.assigned',
  );

  protected readonly crumbs = computed<readonly Crumb[]>(() => {
    // The scope crumb: the Company for an owner; for an operator, their assigned Platforms (the switcher's wording),
    // never "Company", which would imply company-wide scope. Not a link for an operator.
    const company: Crumb = this.companyScope()
      ? { label: 'shell.breadcrumb.company', translate: true, link: '/overview' }
      : { label: 'shell.context.assigned', translate: true };
    const scope = this.context.scope();
    if (scope.kind === 'platform') {
      const visible = this.context.platforms();
      const name =
        visible.status === 'success'
          ? visible.data.find((p) => p.id === scope.platformId)?.name
          : undefined;
      const platforms: Crumb[] = can(this.session.actor(), 'company.platforms.view')
        ? [{ label: 'shell.breadcrumb.platforms', translate: true, link: '/platforms' }]
        : [];
      return [
        company,
        ...platforms,
        name
          ? { label: name, translate: false }
          : { label: 'shell.breadcrumb.platform', translate: true },
      ];
    }
    const page = this.pageKey();
    return page ? [company, { label: page, translate: true }] : [company];
  });
}
