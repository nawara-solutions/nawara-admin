import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlatformId, platformId } from '../../../core/context/scope.model';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { OperatorCreateAction } from '../application/operator-create.action';
import { OperatorDirectoryFacade } from '../application/operator-directory.facade';
import {
  AccountStateFilter,
  OPERATOR_SORTS,
  OperatorSort,
  PlatformFilter,
  STATE_FILTERS,
} from '../application/operator-query';
import { OperatorList } from '../components/operator-list/operator-list';
import { OperatorsHeader } from '../components/operators-header/operators-header';

/** Catalog keys of the selects' options, listed in full (never built at runtime). */
const SORT_KEYS = {
  contact: 'operators.sort.contact',
  platforms: 'operators.sort.platforms',
  newest: 'operators.sort.newest',
} as const satisfies Record<OperatorSort, string>;

const STATE_FILTER_KEYS = {
  any: 'operators.stateFilter.any',
  canSignIn: 'operators.state.canSignIn',
  awaitingConfirmation: 'operators.state.awaitingConfirmation',
  blocked: 'operators.state.blocked',
} as const satisfies Record<AccountStateFilter, string>;

/**
 * Operators & access (`/operators`; P6 design, artboards Main and MobileEn): the owner's read-only directory of the
 * Company's operators and the Platforms each is assigned to. PROVISIONAL (CF-03): Core has no operator directory, so
 * a demo build reads the demo world and any other build says it is not available. The owner creates an operator from
 * the header (P6-S4: `OperatorCreateAction`, demo builds only: without a directory a created operator could not be
 * found again, so no other build offers it).
 *
 * The search filters the loaded list by email or phone and stays in the page (contacts never go into a URL); the
 * Platform filter, the account-state filter and the sort are URL parameters. The count is announced politely.
 */
@Component({
  selector: 'adm-operator-directory-page',
  imports: [
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDataState,
    NwFormField,
    NwIcon,
    OperatorList,
    OperatorsHeader,
  ],
  templateUrl: './operator-directory.page.html',
  styleUrl: './operator-directory.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'operator-directory' },
})
export class OperatorDirectoryPage {
  protected readonly facade = inject(OperatorDirectoryFacade);
  protected readonly create = inject(OperatorCreateAction);
  protected readonly sorts = OPERATOR_SORTS;
  protected readonly sortKeys = SORT_KEYS;
  protected readonly stateFilters = STATE_FILTERS;
  protected readonly stateFilterKeys = STATE_FILTER_KEYS;
  protected readonly platformName = (id: PlatformId) => this.facade.platformName(id);

  protected onSearch(event: Event): void {
    this.facade.search.set((event.target as HTMLInputElement).value);
  }

  protected onPlatform(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const filter: PlatformFilter =
      value === 'any' || value === 'none'
        ? value
        : (this.facade.platforms().find((p) => p.id === platformId(value))?.id ?? 'any');
    this.facade.setQuery({ platform: filter });
  }

  protected onState(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const filter = this.stateFilters.find((f) => f === value);
    if (filter !== undefined) this.facade.setQuery({ state: filter });
  }

  protected onSort(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const sort = this.sorts.find((s) => s === value);
    if (sort !== undefined) this.facade.setQuery({ sort });
  }
}
