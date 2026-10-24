import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { organizationPath, platformPath } from '../../../core/context/scope-context';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import {
  PlatformSubscriptionsFacade,
  STATE_FILTERS,
  SubscriptionStateFilter,
  parseStateFilter,
} from '../application/platform-subscriptions.facade';
import {
  EntitlementState,
  SubscriptionDistribution,
  SubscriptionState,
} from '../domain/licenses.model';

/** Catalog keys, listed in full (never built at runtime). */
const FILTER_KEYS = {
  all: 'licenses.platform.filter.all',
  active: 'licenses.platform.filter.active',
  endingSoon: 'licenses.platform.filter.endingSoon',
  grace: 'licenses.platform.filter.grace',
  none: 'licenses.platform.filter.none',
} as const satisfies Record<SubscriptionStateFilter, string>;

const STATE_KEYS = {
  active: 'licenses.platform.state.active',
  grace: 'licenses.platform.state.grace',
  none: 'licenses.platform.state.none',
} as const satisfies Record<SubscriptionState, string>;

const ENTITLEMENT_KEYS = {
  entitled: 'licenses.platform.entitlement.entitled',
  entitledInGrace: 'licenses.platform.entitlement.entitledInGrace',
  notEntitled: 'licenses.platform.entitlement.notEntitled',
} as const satisfies Record<EntitlementState, string>;

/** How many Organizations each filter keeps: the canonical distribution, never a second count. */
const filterCount = (d: SubscriptionDistribution, filter: SubscriptionStateFilter): number =>
  filter === 'all' ? d.organizations : filter === 'endingSoon' ? d.endingSoon : d[filter];

/**
 * One Platform's Organization subscriptions (`/licenses/platforms/:platformId`; P7 design, artboard Platform list), the
 * Company owner's read-only directory: each Organization's subscription state, when it ends (or ended), whether it ends
 * soon, and whether it is entitled now, kept as separate columns. PROVISIONAL (proposed CF-36, CF-37): a demo build
 * reads the demo world, any other build says it is not available. The state filter is in the URL; the search is local.
 * Nothing here can be changed.
 */
@Component({
  selector: 'adm-platform-subscriptions-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDataState,
    NwDatePipe,
    NwFormField,
    NwIcon,
    NwNumberPipe,
  ],
  templateUrl: './platform-subscriptions.page.html',
  styleUrl: './platform-subscriptions.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platform-subscriptions' },
})
export class PlatformSubscriptionsPage {
  protected readonly facade = inject(PlatformSubscriptionsFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly filters = STATE_FILTERS;
  protected readonly filterKeys = FILTER_KEYS;
  protected readonly stateKeys = STATE_KEYS;
  protected readonly entitlementKeys = ENTITLEMENT_KEYS;
  protected readonly filterCount = filterCount;
  protected readonly platformPath = platformPath;
  protected readonly organizationPath = organizationPath;

  protected onFilter(event: Event): void {
    this.facade.setFilter(parseStateFilter((event.target as HTMLSelectElement).value));
  }

  protected onSearch(event: Event): void {
    this.facade.setSearch((event.target as HTMLInputElement).value);
  }

  protected clearAll(): void {
    this.facade.setSearch('');
    this.facade.setFilter('all');
  }
}
