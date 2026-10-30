import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { organizationPath, platformPath } from '../../../core/context/scope-context';
import { PlatformId } from '../../../core/context/scope.model';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import {
  AssistanceDirectoryFacade,
  AssistanceIndicatorFilter,
  CASE_ORDERS,
  INDICATOR_FILTERS,
} from '../application/assistance-directory.facade';
import { selectionId } from '../domain/assistance-read-context';
import {
  AssistanceCaseOrder,
  AssistanceCaseSummary,
  LateSettlementStatus,
  isAssistanceRequestState,
} from '../domain/assistance-read.model';
import {
  AssistanceOversight,
  CashReturnStage,
  STAGE_SOURCE,
  SettlementStage,
  assistanceOversight,
} from '../domain/assistance-oversight';
import { AssistanceSourceTag } from '../ui/assistance-source-tag';
import {
  ASSISTANCE_REQUEST_STATES,
  SETTLEMENT_CHANNEL_STATES,
  AssistanceRequestState,
  RecoveryObligationState,
  SettlementChannelState,
} from '../domain/assistance.model';

/** Catalog keys, listed in full (never built at runtime). */
const STATE_KEYS = {
  pending: 'assistanceCases.state.pending',
  declined: 'assistanceCases.state.declined',
  cash_collected: 'assistanceCases.state.cashCollected',
  settled: 'assistanceCases.state.settled',
  returned: 'assistanceCases.state.returned',
} as const satisfies Record<AssistanceRequestState, string>;

const STATE_TONES = {
  pending: 'info',
  declined: 'info',
  cash_collected: 'warning',
  settled: 'success',
  returned: 'info',
} as const satisfies Record<AssistanceRequestState, NwStatusTone>;

const CHANNEL_KEYS = {
  open: 'assistanceCases.channel.open',
  uncertain: 'assistanceCases.channel.uncertain',
  settled: 'assistanceCases.channel.settled',
  closed: 'assistanceCases.channel.closed',
} as const satisfies Record<SettlementChannelState, string>;

const INDICATOR_KEYS = {
  all: 'assistanceCases.filter.indicatorAll',
  overdue: 'assistanceCases.filter.overdue',
  disputed: 'assistanceCases.filter.disputed',
  cashReturnOwed: 'assistanceCases.filter.cashReturnOwed',
  lateUnapplied: 'assistanceCases.filter.lateUnapplied',
  recoveryOpen: 'assistanceCases.filter.recoveryOpen',
} as const satisfies Record<AssistanceIndicatorFilter, string>;

const ORDER_KEYS = {
  consentNewest: 'assistanceCases.filter.newest',
  consentOldest: 'assistanceCases.filter.oldest',
} as const satisfies Record<AssistanceCaseOrder, string>;

const LATE_KEYS = {
  unapplied: 'assistanceCases.indicator.lateUnapplied',
  applied: 'assistanceCases.indicator.lateApplied',
} as const satisfies Record<LateSettlementStatus, string>;

const LATE_TONES = {
  unapplied: 'warning',
  applied: 'success',
} as const satisfies Record<LateSettlementStatus, NwStatusTone>;

const RECOVERY_KEYS = {
  open: 'assistanceCases.indicator.recoveryOpen',
  recovered: 'assistanceCases.indicator.recovered',
} as const satisfies Record<RecoveryObligationState, string>;

const RECOVERY_TONES = {
  open: 'danger',
  recovered: 'success',
} as const satisfies Record<RecoveryObligationState, NwStatusTone>;

/** Catalog keys of the oversight stages (A6), shared wording with the case page. */
const SETTLEMENT_STAGE_KEYS = {
  none: 'assistanceCases.oversight.settlement.none',
  inProgress: 'assistanceCases.oversight.settlement.inProgress',
  uncertain: 'assistanceCases.oversight.settlement.uncertain',
  verified: 'assistanceCases.oversight.settlement.verified',
  verifiedLate: 'assistanceCases.oversight.settlement.verifiedLate',
  lateUnapplied: 'assistanceCases.oversight.settlement.lateUnapplied',
  closedUnpaid: 'assistanceCases.oversight.settlement.closedUnpaid',
} as const satisfies Record<SettlementStage, string>;

const RETURN_STAGE_KEYS = {
  none: 'assistanceCases.oversight.cashReturn.none',
  owed: 'assistanceCases.oversight.cashReturn.owed',
  reported: 'assistanceCases.oversight.cashReturn.reported',
  confirmed: 'assistanceCases.oversight.cashReturn.confirmed',
  superseded: 'assistanceCases.oversight.cashReturn.superseded',
} as const satisfies Record<CashReturnStage, string>;

/** The last characters of a Core id, enough to tell rows apart; the full id is in the cell's accessible name. */
const shortRef = (id: string): string => id.slice(-8);

/**
 * Organization Assistance case directory (`/billing/assistance`; Assistance A4): the Company owner's READ-ONLY list of assisted
 * cash payments, through the A2 gateway. A demo build reads the simulated cases of Assistance A3 and says so; every other build
 * says it is not available (Core has no owner read of assistance requests, CF-70). Each row shows Core's states only: the
 * request's lifecycle, whether the whole amount was collected (and by when it must settle), the settlement channel, and its
 * exception indicators. No amount, total or count is computed here, and nothing can be decided, collected, paid or corrected.
 */
@Component({
  selector: 'adm-assistance-directory-page',
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
    NwStatusBadge,
    AssistanceSourceTag,
  ],
  templateUrl: './assistance-directory.page.html',
  styleUrl: './assistance-directory.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance' },
})
export class AssistanceDirectoryPage {
  protected readonly facade = inject(AssistanceDirectoryFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly states = ASSISTANCE_REQUEST_STATES;
  protected readonly indicators = INDICATOR_FILTERS;
  protected readonly orders = CASE_ORDERS;
  protected readonly stateKeys = STATE_KEYS;
  protected readonly stateTones = STATE_TONES;
  protected readonly channelKeys = CHANNEL_KEYS;
  protected readonly indicatorKeys = INDICATOR_KEYS;
  protected readonly orderKeys = ORDER_KEYS;
  protected readonly lateKeys = LATE_KEYS;
  protected readonly lateTones = LATE_TONES;
  protected readonly recoveryKeys = RECOVERY_KEYS;
  protected readonly recoveryTones = RECOVERY_TONES;
  protected readonly shortRef = shortRef;
  protected readonly channels = SETTLEMENT_CHANNEL_STATES;
  protected readonly sources = STAGE_SOURCE;
  protected readonly settlementKeys = SETTLEMENT_STAGE_KEYS;
  protected readonly returnKeys = RETURN_STAGE_KEYS;

  /** The search field's text, and whether its last submission was not a full case reference. */
  protected readonly reference = signal('');
  protected readonly referenceInvalid = signal(false);

  protected readonly platformName = computed(() => {
    const names = new Map(this.facade.platforms().map((p) => [p.id as string, p.name]));
    return (id: PlatformId): string | null => names.get(id) ?? null;
  });

  protected organizationLink(row: AssistanceCaseSummary): string {
    return organizationPath(row.platformId, row.organizationId);
  }

  /** One case's page (A5). */
  protected casePath(requestId: string): string {
    return `/billing/assistance/${requestId}`;
  }

  protected platformLink(id: PlatformId): string {
    return platformPath(id);
  }

  protected onPlatform(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const platform = this.facade.platforms().find((p) => p.id === value)?.id ?? null;
    this.facade.update({ platform });
  }

  protected onState(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.facade.update({ state: isAssistanceRequestState(value) ? value : null });
  }

  protected onChannel(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const channel = SETTLEMENT_CHANNEL_STATES.find((c) => c === value) ?? null;
    this.facade.update({ channel });
  }

  /** One row's oversight (A6), from the row's Core values only. */
  protected oversightOf(row: AssistanceCaseSummary): AssistanceOversight {
    return assistanceOversight(row);
  }

  protected onIndicator(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const indicator = INDICATOR_FILTERS.find((i) => i === value) ?? 'all';
    this.facade.update({ indicator });
  }

  protected onOrder(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const order = CASE_ORDERS.find((o) => o === value) ?? 'consentNewest';
    this.facade.update({ order });
  }

  protected onReferenceInput(event: Event): void {
    this.reference.set((event.target as HTMLInputElement).value);
    this.referenceInvalid.set(false);
  }

  /** Searches one case by its full reference; anything else is refused here and never sent. */
  protected search(event: Event): void {
    event.preventDefault();
    const text = this.reference().trim();
    if (text === '') return this.clearSearch();
    const reference = selectionId({ kind: 'case', requestId: text });
    this.referenceInvalid.set(reference === null);
    if (reference !== null) this.facade.update({ reference });
  }

  protected clearSearch(): void {
    this.reference.set('');
    this.referenceInvalid.set(false);
    this.facade.update({ reference: null });
  }

  protected clearAll(): void {
    this.reference.set('');
    this.referenceInvalid.set(false);
    this.facade.clear();
  }
}
