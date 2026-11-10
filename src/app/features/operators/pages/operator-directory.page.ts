import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { TranslocoService } from '@jsverse/transloco';
import { OperatorAssignmentGateway } from '../data-access/operator-assignment.gateway';
import { OperatorAccountGateway } from '../data-access/operator-account.gateway';
import { PlatformId } from '../../../core/context/scope.model';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwDialogService } from '../../../shared/ui/dialog/dialog.service';
import { OperatorDetailFacade, OPERATOR_DETAIL_ID } from '../application/operator-detail.facade';
import { PlatformAccessAction } from '../application/platform-access.action';
import { OperatorBlockAction } from '../application/operator-block.action';
import { OperatorDetailPanel } from '../components/operator-detail-panel';
import { OperatorSummary, contactText } from '../domain/operator.model';
import { OperatorCreateAction } from '../application/operator-create.action';
import { OperatorDirectoryFacade } from '../application/operator-directory.facade';
import { OPERATOR_SORTS, OperatorSort, STATE_FILTERS } from '../application/operator-query';
import { OperatorList } from '../components/operator-list/operator-list';
import { OperatorCreateDialog } from '../components/operator-create-dialog/operator-create-dialog';
import { OperatorsHeader } from '../components/operators-header/operators-header';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { OperatorFilterDialog, OperatorFilterData } from '../components/operator-filter-dialog';
import { DEFAULT_OPERATOR_QUERY, OperatorQuery } from '../application/operator-query';

/** Catalog keys of the selects' options, listed in full (never built at runtime). */
const SORT_KEYS = {
  contact: 'operators.sort.contact',
  'contact-desc': 'operators.sort.contactDesc',
  'platforms-asc': 'operators.sort.platformsAsc',
  oldest: 'operators.sort.oldest',
  state: 'operators.sort.state',
  'state-desc': 'operators.sort.stateDesc',
  platforms: 'operators.sort.platforms',
  newest: 'operators.sort.newest',
} as const satisfies Record<OperatorSort, string>;

const STATE_FILTER_KEYS = {
  any: 'operators.stateFilter.any',
  canSignIn: 'operators.state.canSignIn',
  awaitingConfirmation: 'operators.state.awaitingConfirmation',
  blocked: 'operators.state.blocked',
} as const satisfies Record<(typeof STATE_FILTERS)[number], string>;

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
    NwDataState,
    NwIcon,
    OperatorList,
    OperatorCreateDialog,
    OperatorsHeader,
    OperatorFilterDialog,
    CdkOverlayOrigin,
    CdkConnectedOverlay,
  ],
  templateUrl: './operator-directory.page.html',
  styleUrl: './operator-directory.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'operator-directory' },
})
export class OperatorDirectoryPage {
  protected readonly preferences = inject(AccordionPreferences);
  private readonly session = inject(AuthSession);
  private readonly assignmentGateway = inject(OperatorAssignmentGateway);
  private readonly accountGateway = inject(OperatorAccountGateway);
  private readonly toasts = inject(NwToastService);
  private readonly translations = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly rowActionBusy = signal(false);
  protected readonly canGrant = computed(
    () =>
      this.assignmentGateway.available &&
      can(this.session.actor(), 'operator.platformAccess.change'),
  );
  protected readonly canBlock = computed(
    () => this.accountGateway.available && can(this.session.actor(), 'operator.account.block'),
  );
  protected readonly canGrantRow = (operator: OperatorSummary) =>
    this.facade.platforms().some((platform) => !operator.activePlatformIds.includes(platform.id));
  protected openRowAction(operator: OperatorSummary, kind: 'grant' | 'block'): void {
    if (this.rowActionBusy() || (kind === 'grant' ? !this.canGrant() : !this.canBlock())) return;
    this.rowActionBusy.set(true);
    const injector = Injector.create({
      parent: this.injector,
      providers: [
        { provide: OPERATOR_DETAIL_ID, useValue: operator.id },
        OperatorDetailFacade,
        PlatformAccessAction,
        OperatorBlockAction,
      ],
    });
    const detail = injector.get(OperatorDetailFacade);
    const action =
      kind === 'grant' ? injector.get(PlatformAccessAction) : injector.get(OperatorBlockAction);
    let opened = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      this.rowActionBusy.set(false);
      queueMicrotask(() => injector.destroy());
    };
    const unregister = this.destroyRef.onDestroy(finish);
    effect(
      () => {
        if (finished) return;
        if (opened) {
          if (action.run.state().phase === 'closed') {
            unregister();
            finish();
          }
          return;
        }
        const view = detail.view();
        const history = detail.historyView();
        if (view.status === 'loading' || (view.status === 'ready' && history.status === 'loading'))
          return;
        if (view.status !== 'ready' || (kind === 'grant' && history.status !== 'ready')) {
          this.toasts.show(this.translations.translate('operators.detail.history.elsewhere'), {
            tone: 'danger',
          });
          unregister();
          finish();
          return;
        }
        if (kind === 'grant') {
          const platform = detail.companyPlatforms().find((p) => detail.isAssigned(p.id) === false);
          if (!platform) {
            this.toasts.show(this.translations.translate('operators.access.nothingLeft'), {
              tone: 'info',
            });
            unregister();
            finish();
            return;
          }
          (action as PlatformAccessAction).open({
            operatorId: view.operator.id,
            contact: view.operator.contact,
            platform,
            grant: true,
          });
        } else {
          (action as OperatorBlockAction).open(
            view.operator,
            history.status === 'ready' ? history.current.length : 0,
          );
        }
        opened = true;
        if (action.run.state().phase === 'closed') {
          unregister();
          finish();
        }
      },
      { injector },
    );
  }
  private readonly dialogs = inject(NwDialogService);
  private readonly injector = inject(Injector);
  protected openOperator(operator: OperatorSummary): void {
    const injector = Injector.create({
      parent: this.injector,
      providers: [
        { provide: OPERATOR_DETAIL_ID, useValue: operator.id },
        OperatorDetailFacade,
        PlatformAccessAction,
        OperatorBlockAction,
      ],
    });
    const ref = this.dialogs.open(OperatorDetailPanel, {
      sidePanel: true,
      injector,
      data: { contact: contactText(operator.contact) },
    });
    ref.closed.subscribe(() => injector.destroy());
  }

  protected readonly popup = signal<OperatorFilterData | null>(null);
  protected readonly popupOrigin = signal<CdkOverlayOrigin | undefined>(undefined);
  protected readonly popupPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  ];
  protected closePopup(query?: OperatorQuery): void {
    this.popup.set(null);
    if (query) this.facade.setQuery(query);
  }
  protected readonly facade = inject(OperatorDirectoryFacade);
  protected readonly pageSize = signal<10 | 50 | 'all'>(10);
  protected readonly pageSizes = [10, 50, 'all'] as const;
  protected readonly pageSizeOpen = signal(false);
  protected readonly requestedPage = signal(0);
  protected readonly pageCount = computed(() => {
    const size = this.pageSize();
    return size === 'all' ? 1 : Math.max(1, Math.ceil(this.facade.rows().length / size));
  });
  protected readonly pageIndex = computed(() =>
    Math.min(this.requestedPage(), this.pageCount() - 1),
  );
  protected readonly pageRows = computed(() => {
    const rows = this.facade.rows();
    const size = this.pageSize();
    return size === 'all'
      ? rows
      : rows.slice(this.pageIndex() * size, (this.pageIndex() + 1) * size);
  });
  private readonly resetPageOnQuery = effect(() => {
    this.facade.query();
    this.facade.search();
    this.requestedPage.set(0);
  });
  protected readonly create = inject(OperatorCreateAction);
  protected readonly sorts = OPERATOR_SORTS;
  protected readonly sortKeys = SORT_KEYS;
  protected readonly stateFilters = STATE_FILTERS;
  protected readonly stateFilterKeys = STATE_FILTER_KEYS;
  protected readonly platformName = (id: PlatformId) => this.facade.platformName(id);

  protected openFilters(mode: 'filters' | 'sort', origin: CdkOverlayOrigin): void {
    if (this.popup()?.mode === mode) {
      this.closePopup();
      return;
    }
    this.popupOrigin.set(origin);
    this.popup.set({
      mode,
      query: this.facade.query(),
      groups: [
        {
          field: 'platform',
          label: 'operators.toolbar.platform',
          options: [
            { value: 'any', key: 'operators.platformFilter.any' },
            ...this.facade.platforms().map((p) => ({ value: p.id, label: p.name })),
            { value: 'none', key: 'operators.platformFilter.none' },
            { value: 'assigned', key: 'operators.totals.assignments' },
          ],
        },
        {
          field: 'state',
          label: 'operators.toolbar.state',
          options: this.stateFilters.map((value) => ({
            value,
            key: this.stateFilterKeys[value],
          })),
        },
        {
          field: 'sort',
          label: 'operators.toolbar.sort',
          options: this.sorts.map((value) => ({ value, key: this.sortKeys[value] })),
        },
      ].filter((group) =>
        mode === 'sort' ? group.field === 'sort' : group.field !== 'sort',
      ) as OperatorFilterData['groups'],
    });
  }

  protected onSearch(event: Event): void {
    this.facade.search.set((event.target as HTMLInputElement).value);
  }

  protected setPageSize(value: 10 | 50 | 'all'): void {
    this.pageSize.set(value);
    this.requestedPage.set(0);
    this.pageSizeOpen.set(false);
  }

  protected resetAll(): void {
    this.closePopup();
    this.facade.search.set('');
    this.facade.setQuery(DEFAULT_OPERATOR_QUERY);
  }
}
import { AccordionPreferences } from '../../../core/preferences/accordion-preferences';
