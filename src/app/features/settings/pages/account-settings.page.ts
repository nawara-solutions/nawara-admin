import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NwButton } from '../../../shared/ui/button/button';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { accountSettingsView } from '../application/account-settings-view';
import { AccountIdentitySummary } from '../components/account-settings/account-identity-summary';
import { AccountProfilePanel } from '../components/account-settings/account-profile-panel';
import { AccountAccessPanel } from '../components/account-settings/account-access-panel';
import { AccountSecurityPanel } from '../components/account-settings/account-security-panel';

const SECTIONS = [
  {
    id: 'profile',
    key: 'settings.account.profileTab',
    icon: 'user-round',
    title: 'settings.account.profileTitle',
    description: 'settings.account.profileDescription',
  },
  {
    id: 'access',
    key: 'settings.account.accessTab',
    icon: 'building-2',
    title: 'settings.account.accessTab',
    description: 'settings.account.accessDescription',
  },
  {
    id: 'security',
    key: 'settings.account.securityTab',
    icon: 'shield-check',
    title: 'settings.account.securityTab',
    description: 'settings.account.securityDescription',
  },
] as const;

/** Own account only. Query navigation uses Angular Router and never replaces session or scope state. */
@Component({
  selector: 'adm-account-settings-page',
  imports: [
    TranslocoPipe,
    RouterLink,
    NwButton,
    NwDataState,
    NwIcon,
    AccountIdentitySummary,
    AccountProfilePanel,
    AccountAccessPanel,
    AccountSecurityPanel,
  ],
  templateUrl: './account-settings.page.html',
  styleUrl: './account-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'account-settings' },
})
export class AccountSettingsPage {
  private readonly session = inject(AuthSession);
  protected readonly context = inject(ScopeContext);
  protected readonly isDemo = this.session.isDemo;
  private readonly params = toSignal(inject(ActivatedRoute).queryParamMap);
  protected readonly sections = SECTIONS;
  protected readonly selected = computed(
    () => SECTIONS.find((s) => s.id === this.params()?.get('section')) ?? SECTIONS[0],
  );
  protected readonly view = computed(() =>
    accountSettingsView(this.session.actor(), this.context.directory(), this.context.platforms()),
  );
}
