import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { NwIcon } from '../../../shared/ui/icon/icon';
import type { NwIconName } from '../../../shared/ui/icon/icon.registry';

const SECTIONS = [
  { path: 'appearance', key: 'settings.appearance.title', icon: 'palette' },
  { path: 'page-sections', key: 'settings.accordions.title', icon: 'sliders-horizontal' },
  { path: 'language', key: 'settings.language.title', icon: 'globe' },
  { path: 'account', key: 'settings.account.title', icon: 'user-round' },
  { path: 'security', key: 'settings.security.title', icon: 'shield-check' },
  { path: 'company', key: 'settings.company.title', icon: 'building-2' },
] as const satisfies readonly { path: string; key: string; icon: NwIconName }[];

/** URL-owned Settings navigation; child route guards remain authoritative. */
@Component({
  selector: 'adm-settings-workspace',
  imports: [RouterLink, RouterOutlet, TranslocoPipe, NwIcon],
  template: `
    <header class="settings-workspace__header">
      <h1 class="nw-page-title">{{ 'settings.title' | transloco }}</h1>
    </header>
    <nav class="settings-workspace__navigation" [attr.aria-label]="'settings.title' | transloco">
      @for (section of sections(); track section.path) {
        <a
          class="settings-workspace__link"
          [routerLink]="section.path"
          [attr.data-section]="section.path"
          [attr.aria-current]="active(section.path) ? 'page' : null"
        >
          <nw-icon [name]="section.icon" size="sm" />
          <span>{{ section.key | transloco }}</span>
        </a>
      }
    </nav>
    <div class="settings-workspace__content"><router-outlet /></div>
  `,
  styleUrl: './settings-workspace.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsWorkspace {
  private readonly router = inject(Router);
  private readonly session = inject(AuthSession);
  private readonly navigation = toSignal(
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)),
  );
  protected readonly sections = computed(() =>
    SECTIONS.filter((section) =>
      section.path === 'security'
        ? can(this.session.actor(), 'account.security.view')
        : section.path === 'company'
          ? can(this.session.actor(), 'company.settings.view')
          : true,
    ),
  );
  protected active(path: string): boolean {
    this.navigation();
    const url = this.router.url.split(/[?#]/)[0] ?? '';
    return (
      (path === 'appearance' && url.endsWith('/settings')) ||
      url.endsWith('/settings/' + path) ||
      url.includes('/settings/' + path + '/')
    );
  }
}
