import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter, map, startWith } from 'rxjs';
import { can } from '../../core/access/capability-policy';
import { homePath } from '../../core/access/home-path';
import { AuthSession } from '../../core/auth/auth-session';
import { EntityLabel } from '../../core/context/entity-label';
import { LocaleService } from '../../core/i18n/locale.service';
import {
  ScopeContext,
  membersPath,
  organizationPath,
  organizationsPath,
  platformPath,
} from '../../core/context/scope-context';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwMenu, NwMenuItem, NwMenuTrigger } from '../../shared/ui/menu/menu';
import { calculateBreadcrumbLayout, splitBreadcrumbs } from './breadcrumb-layout';

/** Route data key: the catalog key of the page's last breadcrumb ("Overview"). */
export const BREADCRUMB_DATA = 'breadcrumb';

/**
 * Route data key: the company-scope page above it, as `{ key, link }` ("Operators & access" above "Operator"), or the pages above
 * it, outermost first, as an array ("Billing", "Assistance" above "Disputes", A11).
 */
export const BREADCRUMB_PARENT_DATA = 'breadcrumbParent';

interface ParentCrumb {
  readonly key: string;
  readonly link: string;
}

interface PageCrumbs {
  readonly key: string;
  readonly parents: readonly ParentCrumb[];
}

const parentOf = (value: unknown): ParentCrumb | null =>
  typeof value === 'object' &&
  value !== null &&
  'key' in value &&
  typeof value.key === 'string' &&
  'link' in value &&
  typeof value.link === 'string'
    ? { key: value.key, link: value.link }
    : null;

/** One parent or a chain of them; an ill-formed entry drops the whole chain (never a partial trail). */
const parentsOf = (value: unknown): readonly ParentCrumb[] => {
  const list: unknown[] = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const parents = list.map(parentOf);
  return parents.every((p): p is ParentCrumb => p !== null) ? parents : [];
};

interface Crumb {
  readonly label: string;
  readonly translate: boolean;
  readonly link?: string;
}

/**
 * Breadcrumbs follow the hierarchy Company → Platform → Organization (docs/ARCHITECTURE.md §7): "Company › Overview" in
 * company scope, "Company › Platforms › Nawara School" in platform scope (Platforms only for an owner, who has the
 * directory), then "› Organizations › Collège Riad" below it. The Organization's name comes from its page
 * (`EntityLabel`), for that page only; until it is known the crumb says "Organization". The last item is the current
 * page.
 */
@Component({
  selector: 'adm-breadcrumbs',
  imports: [RouterLink, TranslocoPipe, NwIcon, NwMenu, NwMenuItem, NwMenuTrigger],
  templateUrl: './breadcrumbs.html',
  styleUrl: './breadcrumbs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'breadcrumbs' },
})
export class Breadcrumbs implements AfterViewInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly context = inject(ScopeContext);
  private readonly session = inject(AuthSession);
  private readonly entity = inject(EntityLabel, { optional: true });
  private readonly locale = inject(LocaleService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly layout = signal({
    hiddenAncestorCount: 0,
    showHome: true,
    currentMaxWidth: 320,
    wrapCurrent: false,
  });

  private readonly pageKey = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        let route = this.route.snapshot;
        while (route.firstChild) route = route.firstChild;
        const key: unknown = route.data[BREADCRUMB_DATA];
        return typeof key === 'string'
          ? ({ key, parents: parentsOf(route.data[BREADCRUMB_PARENT_DATA]) } satisfies PageCrumbs)
          : null;
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
      const platform: Crumb = name
        ? { label: name, translate: false }
        : { label: 'shell.breadcrumb.platform', translate: true };
      const page = this.context.platformPage();
      if (page.kind === 'dashboard' || page.kind === 'other')
        return [company, ...platforms, platform];
      const organizations: Crumb = {
        label: 'shell.breadcrumb.organizations',
        translate: true,
        link: organizationsPath(scope.platformId),
      };
      const trail = [
        company,
        ...platforms,
        { ...platform, link: platformPath(scope.platformId) },
        organizations,
      ];
      if (page.kind === 'organizations') return trail;
      const path = this.context.url().split(/[?#]/)[0] ?? '';
      // The Organization's name, set by the page that shows it (detail or members); never a member's contact.
      const organizationName = this.entity?.labelFor(path) ?? null;
      const organization: Crumb = organizationName
        ? { label: organizationName, translate: false }
        : { label: 'shell.breadcrumb.organization', translate: true };
      if (page.kind === 'organization') return [...trail, organization];
      const withOrganization = [
        ...trail,
        { ...organization, link: organizationPath(scope.platformId, page.organizationId) },
      ];
      const members: Crumb = { label: 'shell.breadcrumb.members', translate: true };
      if (page.kind === 'members') return [...withOrganization, members];
      return [
        ...withOrganization,
        { ...members, link: membersPath(scope.platformId, page.organizationId) },
        { label: 'shell.breadcrumb.membership', translate: true },
      ];
    }
    const page = this.pageKey();
    if (page === null) return [company];
    const parents: Crumb[] = page.parents.map((p) => ({
      label: p.key,
      translate: true,
      link: p.link,
    }));
    return [company, ...parents, { label: page.key, translate: true }];
  });

  private readonly partition = computed(() =>
    splitBreadcrumbs(this.crumbs(), this.layout().hiddenAncestorCount),
  );
  protected readonly currentCrumb = computed(
    () => this.partition().current ?? { label: 'shell.breadcrumb.company', translate: true },
  );
  protected readonly hiddenCrumbs = computed(() => this.partition().hiddenAncestors);
  protected readonly visibleAncestors = computed(() => this.partition().visibleAncestors);

  constructor() {
    // Measure after Angular has rendered new route labels. ResizeObserver handles space changes from sibling controls.
    afterRenderEffect(() => {
      this.crumbs();
      this.locale.locale();
      this.fitCrumbs();
    });
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.fitCrumbs());
      observer.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
    const fonts = this.host.nativeElement.ownerDocument.fonts;
    if (fonts) {
      const refit = () => this.fitCrumbs();
      void fonts.ready.then(() => this.fitCrumbs());
      fonts.addEventListener('loadingdone', refit);
      this.destroyRef.onDestroy(() => fonts.removeEventListener('loadingdone', refit));
    }
    this.fitCrumbs();
  }

  private fitCrumbs(): void {
    const nav = this.host.nativeElement.querySelector('nav');
    const rail = this.host.nativeElement.querySelector('.breadcrumbs__measure');
    if (!nav || !rail || nav.clientWidth <= 0) return;
    const labels = Array.from(
      rail.querySelectorAll('.breadcrumbs__measure-label'),
    ) as HTMLElement[];
    const widths = labels.map((item) => item.getBoundingClientRect().width || item.scrollWidth);
    const homeWidth =
      nav.querySelector('.breadcrumbs__home')?.getBoundingClientRect().width ??
      parseFloat(getComputedStyle(nav.ownerDocument.documentElement).fontSize) * 2;
    const separatorWidth =
      nav.querySelector('.breadcrumbs__separator')?.getBoundingClientRect().width ?? 16;
    const list = nav.querySelector('.breadcrumbs__list');
    if (!list) return;
    const gap = parseFloat(getComputedStyle(list).columnGap) || 8;
    const rootFontSize = parseFloat(getComputedStyle(nav.ownerDocument.documentElement).fontSize);
    const overflowWidth = rootFontSize * 1.75;
    const currentWidth = widths.at(-1) ?? 0;
    this.layout.set(
      calculateBreadcrumbLayout(
        nav.clientWidth,
        widths.slice(0, -1),
        currentWidth,
        homeWidth,
        separatorWidth,
        overflowWidth,
        gap,
        currentWidth,
      ),
    );
  }
}
