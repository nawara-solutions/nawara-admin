import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Capability, can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import { CompanySettingsFacade } from '../application/company-settings.facade';

interface ManagementLink {
  readonly id: string;
  readonly path: string;
  readonly icon: NwIconName;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly requires: Capability;
}

/** Where the Company is managed today: existing pages only, each behind its own capability (never rebuilt here). */
const MANAGEMENT: readonly ManagementLink[] = [
  {
    id: 'overview',
    path: '/overview',
    icon: 'house',
    titleKey: 'settings.company.links.overview.title',
    descriptionKey: 'settings.company.links.overview.description',
    requires: 'company.overview.view',
  },
  {
    id: 'platforms',
    path: '/platforms',
    icon: 'building-2',
    titleKey: 'settings.company.links.platforms.title',
    descriptionKey: 'settings.company.links.platforms.description',
    requires: 'company.platforms.view',
  },
  {
    id: 'operators',
    path: '/operators',
    icon: 'shield-check',
    titleKey: 'settings.company.links.operators.title',
    descriptionKey: 'settings.company.links.operators.description',
    requires: 'company.operators.view',
  },
  {
    id: 'licenses',
    path: '/licenses',
    icon: 'file-badge',
    titleKey: 'settings.company.links.licenses.title',
    descriptionKey: 'settings.company.links.licenses.description',
    requires: 'company.commercial.view',
  },
  {
    id: 'billing',
    path: '/billing',
    icon: 'credit-card',
    titleKey: 'settings.company.links.billing.title',
    descriptionKey: 'settings.company.links.billing.description',
    requires: 'company.commercial.view',
  },
  {
    id: 'audit',
    path: '/audit',
    icon: 'scroll-text',
    titleKey: 'settings.company.links.audit.title',
    descriptionKey: 'settings.company.links.audit.description',
    requires: 'company.audit.view',
  },
];

/**
 * Settings → Company (`/settings/company`, P9-S3; docs/design/p9-settings-architecture.md §13), the owner only: the
 * Company's name and Platform count (the demo world through the scope directory's selector; unavailable in a
 * production build), links to where the Company is managed today, and a plain statement that editing the Company's
 * identity, branding or business configuration is not available (no Core contract, CF-49). No edit, save or upload
 * control exists.
 */
@Component({
  selector: 'adm-company-settings-page',
  imports: [RouterLink, TranslocoPipe, NwButton, NwDataState, NwIcon, NwNumberPipe],
  templateUrl: './company-settings.page.html',
  styleUrl: './company-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'company-settings' },
})
export class CompanySettingsPage {
  private readonly session = inject(AuthSession);
  protected readonly facade = inject(CompanySettingsFacade);
  protected readonly isDemo = this.session.isDemo;
  protected readonly links = computed(() =>
    MANAGEMENT.filter((link) => can(this.session.actor(), link.requires)),
  );
}
