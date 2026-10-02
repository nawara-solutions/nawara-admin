import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ScopeContext, platformPath } from '../../core/context/scope-context';
import { PlatformRef } from '../../core/context/scope.model';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwMenu, NwMenuItem, NwMenuTrigger } from '../../shared/ui/menu/menu';

/**
 * Scope switcher (docs/ARCHITECTURE.md §7): the Company with "All platforms" (company scope, `/overview`) or one
 * Platform (platform scope, `/platforms/:platformId`). Switching is navigation, never authentication.
 */
@Component({
  selector: 'adm-context-switcher',
  imports: [TranslocoPipe, NwIcon, NwMenu, NwMenuItem, NwMenuTrigger],
  templateUrl: './context-switcher.html',
  styleUrl: './context-switcher.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'context-switcher' },
})
export class ContextSwitcher {
  private readonly router = inject(Router);
  protected readonly context = inject(ScopeContext);

  protected readonly companyName = computed(() => {
    const directory = this.context.directory();
    return directory.status === 'success' ? directory.data.company.name : null;
  });

  protected readonly platforms = computed<readonly PlatformRef[]>(() => {
    const directory = this.context.directory();
    return directory.status === 'success' ? directory.data.platforms : [];
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
