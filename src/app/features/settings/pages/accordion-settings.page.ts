import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { PlatformSettingsGateway } from '../data-access/platform-settings.gateway';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AccordionPreferences } from '../../../core/preferences/accordion-preferences';
import { NwBrandMark } from '../../../shared/ui/brand-mark/brand-mark';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwButton } from '../../../shared/ui/button/button';

import { AccordionMockShell } from '../components/accordion-mock-shell/accordion-mock-shell';
@Component({
  selector: 'adm-accordion-settings-page',
  imports: [AccordionMockShell, TranslocoPipe, NwBrandMark, NwIcon, NwButton],
  templateUrl: './accordion-settings.page.html',
  styleUrl: './accordion-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccordionSettingsPage {
  protected readonly preferences = inject(AccordionPreferences);
  protected readonly operatorVisible = signal(this.preferences.operatorTotalsMode() !== 'hidden');
  protected readonly figuresVisible = signal(this.preferences.platformFiguresVisible());
  protected readonly subscriptionsVisible = signal(this.preferences.platformSubscriptionsVisible());
  protected readonly dirty = computed(
    () =>
      this.operatorVisible() !== (this.preferences.operatorTotalsMode() !== 'hidden') ||
      this.figuresVisible() !== this.preferences.platformFiguresVisible() ||
      this.subscriptionsVisible() !== this.preferences.platformSubscriptionsVisible(),
  );
  protected readonly customized = computed(
    () => !this.operatorVisible() || !this.figuresVisible() || !this.subscriptionsVisible(),
  );
  protected discard(): void {
    this.operatorVisible.set(this.preferences.operatorTotalsMode() !== 'hidden');
    this.figuresVisible.set(this.preferences.platformFiguresVisible());
    this.subscriptionsVisible.set(this.preferences.platformSubscriptionsVisible());
  }
  protected reset(): void {
    this.operatorVisible.set(true);
    this.figuresVisible.set(true);
    this.subscriptionsVisible.set(true);
  }
  protected apply(): void {
    this.preferences.setOperatorTotalsMode(this.operatorVisible() ? 'visible' : 'hidden');
    this.preferences.setPlatformFiguresVisible(this.figuresVisible());
    this.preferences.setPlatformSubscriptionsVisible(this.subscriptionsVisible());
  }
  protected readonly page = signal<'operators' | 'dashboard' | 'platform'>('operators');
  protected readonly pageSearch = signal('');
  protected readonly translations = inject(TranslocoService);
  protected matchesPage(key: string): boolean {
    return this.translations
      .translate(key)
      .toLocaleLowerCase()
      .includes(this.pageSearch().trim().toLocaleLowerCase());
  }
  protected readonly policy = inject(PlatformSettingsGateway);
  private readonly context = inject(ScopeContext);
  private readonly session = inject(AuthSession);
  protected readonly canConfigure = computed(() =>
    can(this.session.actor(), 'company.settings.view'),
  );
  protected readonly platforms = computed(() => {
    const state = this.context.platforms();
    return state.status === 'success' ? state.data : [];
  });
  protected readonly selected = signal('');
  protected readonly selectedPlatform = computed(
    () => this.platforms().find((p) => p.id === this.selected()) ?? this.platforms()[0],
  );
  protected selectPlatform(event: Event): void {
    this.selected.set((event.target as HTMLSelectElement).value);
  }
}
