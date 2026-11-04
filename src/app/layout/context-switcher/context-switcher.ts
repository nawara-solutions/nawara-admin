import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { can } from '../../core/access/capability-policy';
import { AuthSession } from '../../core/auth/auth-session';
import { ScopeContext, platformPath } from '../../core/context/scope-context';
import { PlatformProduct, PlatformRef } from '../../core/context/scope.model';
import { ProductSymbol } from '../../shared/ui/product-symbol/product-symbol';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwMenu, NwMenuItem, NwMenuTrigger } from '../../shared/ui/menu/menu';

/**
 * Scope switcher (docs/ARCHITECTURE.md §7): the Company with "All platforms" (company scope, `/overview`) or one
 * Platform (platform scope, `/platforms/:platformId`). Switching is navigation, never authentication.
 */
@Component({
  selector: 'adm-context-switcher',
  imports: [TranslocoPipe, ProductSymbol, NwIcon, NwMenu, NwMenuItem, NwMenuTrigger],
  templateUrl: './context-switcher.html',
  styleUrl: './context-switcher.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'context-switcher' },
})
export class ContextSwitcher {
  protected readonly productDescriptionKeys = {
    school: 'shell.context.productDescription.school',
    drive: 'shell.context.productDescription.drive',
  } as const satisfies Record<PlatformProduct, string>;
  private readonly router = inject(Router);
  protected readonly context = inject(ScopeContext);

  private readonly session = inject(AuthSession);

  /** Only an owner has a Company scope; an operator's scope is their assigned Platforms. */
  protected readonly hasCompanyScope = computed(() =>
    can(this.session.actor(), 'company.overview.view'),
  );

  protected readonly companyName = computed(() => {
    const directory = this.context.directory();
    return directory.status === 'success' ? directory.data.company.name : null;
  });

  /** The switcher's title: the Company's name, "Your platforms" for an operator, else "Loading…". */
  protected readonly titleKey = computed(() =>
    this.session.actor()?.kind === 'operator' ? 'shell.context.assigned' : 'shell.context.loading',
  );

  protected readonly platforms = computed<readonly PlatformRef[]>(() => {
    const platforms = this.context.platforms();
    return platforms.status === 'success' ? platforms.data : [];
  });

  /** The selected Platform, or `null` in company scope ("All platforms"). */
  protected readonly currentPlatform = computed(() => {
    const scope = this.context.scope();
    if (scope.kind !== 'platform') return null;
    return this.platforms().find((p) => p.id === scope.platformId) ?? null;
  });

  protected selectCompany(): void {
    void this.router.navigateByUrl('/overview');
  }

  protected selectPlatform(platform: PlatformRef): void {
    void this.router.navigateByUrl(platformPath(platform.id));
  }
}
