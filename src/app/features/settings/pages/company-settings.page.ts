import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { Capability, can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import { ProductSymbol } from '../../../shared/ui/product-symbol/product-symbol';
import { CompanySettingsFacade } from '../application/company-settings.facade';

interface ManagementLink {
  readonly id: string;
  readonly path: string;
  readonly icon: NwIconName;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly requires: Capability;
  readonly group: 'structure' | 'records';
  readonly readOnly?: boolean;
}

/** Where the Company is managed today: existing pages only, each behind its own capability (never rebuilt here). */
const MANAGEMENT: readonly ManagementLink[] = [
  {
    id: 'overview',
    group: 'structure',
    path: '/overview',
    icon: 'house',
    titleKey: 'settings.company.links.overview.title',
    descriptionKey: 'settings.company.links.overview.description',
    requires: 'company.overview.view',
  },
  {
    id: 'platforms',
    group: 'structure',
    path: '/platforms',
    icon: 'building-2',
    titleKey: 'settings.company.links.platforms.title',
    descriptionKey: 'settings.company.links.platforms.description',
    requires: 'company.platforms.view',
  },
  {
    id: 'operators',
    group: 'structure',
    path: '/operators',
    icon: 'shield-check',
    titleKey: 'settings.company.links.operators.title',
    descriptionKey: 'settings.company.links.operators.description',
    requires: 'company.operators.view',
  },
  {
    id: 'licenses',
    group: 'records',
    readOnly: true,
    path: '/licenses',
    icon: 'file-badge',
    titleKey: 'settings.company.links.licenses.title',
    descriptionKey: 'settings.company.links.licenses.description',
    requires: 'company.commercial.view',
  },
  {
    id: 'billing',
    group: 'records',
    readOnly: true,
    path: '/billing',
    icon: 'credit-card',
    titleKey: 'settings.company.links.billing.title',
    descriptionKey: 'settings.company.links.billing.description',
    requires: 'company.commercial.view',
  },
  {
    id: 'audit',
    group: 'records',
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
  imports: [RouterLink, TranslocoPipe, NwButton, NwDataState, NwIcon, NwNumberPipe, ProductSymbol],
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
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  protected readonly sections = [
    {
      id: 'structure',
      key: 'settings.company.layout.structure',
      description: 'settings.company.layout.structureHint',
      icon: 'building-2',
    },
    {
      id: 'records',
      key: 'settings.company.layout.records',
      description: 'settings.company.layout.recordsHint',
      icon: 'scroll-text',
    },
    {
      id: 'profile',
      key: 'settings.company.layout.detailsTitle',
      description: 'settings.company.layout.detailsHint',
      icon: 'id-card',
    },
  ] as const;
  protected readonly selected = computed(
    () =>
      this.sections.find((section) => section.id === this.params()?.get('section')) ??
      this.sections[0],
  );
  protected readonly activeLinks = computed(() =>
    this.links().filter((link) => link.group === this.selected().id),
  );
  protected readonly isSolutions = computed(() => {
    const view = this.facade.view();
    const actor = this.session.actor();
    return (
      view.status === 'ready' &&
      actor?.kind === 'owner' &&
      view.settings.company.id === actor.companyId &&
      view.settings.company.name.trim().toLocaleLowerCase() === 'nawara solutions'
    );
  });
  protected readonly unavailable = [
    {
      icon: 'id-card',
      title: 'settings.company.layout.identityTitle',
      description: 'settings.company.unavailable.identity',
    },
    {
      icon: 'palette',
      title: 'settings.company.layout.brandingTitle',
      description: 'settings.company.unavailable.branding',
    },
    {
      icon: 'settings',
      title: 'settings.company.layout.businessTitle',
      description: 'settings.company.unavailable.business',
    },
  ] as const;
}
