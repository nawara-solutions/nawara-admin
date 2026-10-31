import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext, organizationPath, platformPath } from '../../../core/context/scope-context';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwLink } from '../../../shared/ui/link/link';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import {
  AssistanceLateRow,
  AssistanceSettlementsFacade,
} from '../application/assistance-settlements.facade';
import { assistanceExceptions } from '../domain/assistance-exceptions';
import {
  AssistanceCaseSummary,
  AssistanceCashReturnSummary,
  isCashReturnState,
} from '../domain/assistance-read.model';
import {
  AssistanceRequestState,
  AssistanceRestriction,
  CASH_RETURN_STATES,
  LateSettlementReason,
} from '../domain/assistance.model';
import { AssistanceExceptionBadges } from '../ui/assistance-exception-badges';
import { AssistanceLateStanding } from '../ui/assistance-late-standing';
import { AssistanceMoneyPipe } from '../ui/assistance-money.pipe';
import { AssistanceReturnStanding, RETURN_STATE_LABELS } from '../ui/assistance-return-standing';
import { AssistanceSourceTag } from '../ui/assistance-source-tag';

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

const LATE_REASON_KEYS = {
  channel_closed: 'assistanceCases.case.late.reason.channelClosed',
  purchase_exists: 'assistanceCases.case.late.reason.purchaseExists',
  cash_return_obligation_exists: 'assistanceCases.case.late.reason.cashReturnObligationExists',
  request_not_settleable: 'assistanceCases.case.late.reason.requestNotSettleable',
} as const satisfies Record<LateSettlementReason, string>;

const RESTRICTION_KEYS = {
  T1: 'assistanceCases.case.restriction.t1',
  T2: 'assistanceCases.case.restriction.t2',
  T3: 'assistanceCases.case.restriction.t3',
} as const satisfies Record<AssistanceRestriction, string>;

const shortRef = (id: string): string => id.slice(-8);

/**
 * Organization Assistance LATE SETTLEMENTS & CASH RETURNS (`/billing/assistance/settlements`; Assistance A8): the Company owner's
 * READ-ONLY oversight of verified late settlements (pending or applied: never automatic; where each stands on the owner's L-4
 * decision; its evidence, cash return and restrictions) and of every cash-return obligation (awaiting the Organization's report,
 * reported and awaiting the beneficiary's confirmation, confirmed, or superseded by an applied late settlement), each linked to its
 * A5 case page. A demo build reads the simulated cases of Assistance A3 and says so; every other build says it is not available
 * (CF-69, CF-70). Nothing can be applied, reported, confirmed, paid or authorized here.
 */
@Component({
  selector: 'adm-assistance-settlements-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDataState,
    NwFormField,
    NwIcon,
    NwLink,
    NwNumberPipe,
    NwStatusBadge,
    AssistanceExceptionBadges,
    AssistanceLateStanding,
    AssistanceMoneyPipe,
    AssistanceReturnStanding,
    AssistanceSourceTag,
  ],
  templateUrl: './assistance-settlements.page.html',
  styleUrl: './assistance-settlements.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-settlements' },
})
export class AssistanceSettlementsPage {
  protected readonly facade = inject(AssistanceSettlementsFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  private readonly scope = inject(ScopeContext);

  protected readonly directoryPath = '/billing/assistance';
  protected readonly returnStates = CASH_RETURN_STATES;
  protected readonly returnLabels = RETURN_STATE_LABELS;
  protected readonly lateReasonKeys = LATE_REASON_KEYS;
  protected readonly restrictionKeys = RESTRICTION_KEYS;
  protected readonly stateKeys = STATE_KEYS;
  protected readonly stateTones = STATE_TONES;
  protected readonly shortRef = shortRef;

  /** The page-level state: both lists share one context, so either list's refusal is the page's. */
  protected readonly blocked = computed(() => {
    const status = this.facade.lateSettlements().status;
    return status === 'forbidden' || status === 'notInBuild' ? status : null;
  });

  protected readonly platformName = computed(() => {
    const platforms = this.scope.platforms();
    const names = new Map(
      platforms.status === 'success' ? platforms.data.map((p) => [p.id as string, p.name]) : [],
    );
    return (id: PlatformId): string | null => names.get(id) ?? null;
  });

  protected casePath(requestId: string): string {
    return `/billing/assistance/${requestId}`;
  }

  protected organizationLink(platformId: PlatformId, organizationId: OrganizationId): string {
    return organizationPath(platformId, organizationId);
  }

  protected platformLink(id: PlatformId): string {
    return platformPath(id);
  }

  protected exceptionsOf(row: AssistanceCaseSummary) {
    return assistanceExceptions(row);
  }

  /** Whether the late settlement's case has an open assistance dispute. */
  protected openDispute(row: AssistanceLateRow): boolean {
    return row.detail.disputes.some((d) => d.state === 'open');
  }

  protected trackLate(row: AssistanceLateRow): string {
    return row.late.id;
  }

  protected trackReturn(row: AssistanceCashReturnSummary): string {
    return row.obligation.id;
  }

  protected onLateStatus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.facade.updateLate({
      status: value === 'applied' || value === 'unapplied' ? value : null,
    });
  }

  protected onReturnState(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.facade.updateReturns({ state: isCashReturnState(value) ? value : null });
  }

  protected onReturnDispute(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.facade.updateReturns({ disputed: value === 'open' ? true : null });
  }
}
