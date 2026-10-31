import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext, organizationPath, platformPath } from '../../../core/context/scope-context';
import { PlatformId } from '../../../core/context/scope.model';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwLink } from '../../../shared/ui/link/link';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import { AssistanceDisputesFacade } from '../application/assistance-disputes.facade';
import {
  ASSISTANCE_EXCEPTIONS,
  AssistanceException,
  EXCEPTION_RESTRICTION,
  EXCEPTION_SOURCE,
  assistanceExceptions,
  isAssistanceException,
} from '../domain/assistance-exceptions';
import { STAGE_SOURCE, SettlementStage, assistanceOversight } from '../domain/assistance-oversight';
import {
  AssistanceCaseSummary,
  AssistanceDisputeSummary,
  isAssistanceDisputeReason,
  isAssistanceDisputeState,
} from '../domain/assistance-read.model';
import {
  ASSISTANCE_DISPUTE_REASONS,
  AssistanceDispute,
  AssistanceRequestState,
} from '../domain/assistance.model';
import { RESOLVABLE_DISPUTE_REASONS } from '../domain/assistance.rules';
import { AssistanceExceptionBadges, EXCEPTION_KEYS } from '../ui/assistance-exception-badges';
import { DISPUTE_REASON_KEYS, POSITION_KEYS } from '../ui/assistance-dispute-panel';
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

const SETTLEMENT_STAGE_KEYS = {
  none: 'assistanceCases.oversight.settlement.none',
  inProgress: 'assistanceCases.oversight.settlement.inProgress',
  uncertain: 'assistanceCases.oversight.settlement.uncertain',
  verified: 'assistanceCases.oversight.settlement.verified',
  verifiedLate: 'assistanceCases.oversight.settlement.verifiedLate',
  lateUnapplied: 'assistanceCases.oversight.settlement.lateUnapplied',
  closedUnpaid: 'assistanceCases.oversight.settlement.closedUnpaid',
} as const satisfies Record<SettlementStage, string>;

const EXCEPTION_DESCRIPTION_KEYS = {
  collectionReportedNotSettled: 'assistanceCases.exception.describe.collectionReportedNotSettled',
  uncertainSettlement: 'assistanceCases.exception.describe.uncertainSettlement',
  overdueSettlement: 'assistanceCases.exception.describe.overdueSettlement',
  openDispute: 'assistanceCases.exception.describe.openDispute',
  cashReturn: 'assistanceCases.exception.describe.cashReturn',
  lateSettlementReview: 'assistanceCases.exception.describe.lateSettlementReview',
  recoveryRestriction: 'assistanceCases.exception.describe.recoveryRestriction',
} as const satisfies Record<AssistanceException, string>;

/** Where a dispute stands on Core's only resolution path, from its reason and status alone. */
type DisputePath = 'resolved' | 'correctionOnly' | 'noResolution';

const PATH_KEYS = {
  resolved: 'assistanceCases.case.dispute.timestampCorrected',
  correctionOnly: 'assistanceCases.disputes.path.correctionOnly',
  noResolution: 'assistanceCases.case.dispute.noResolution',
} as const satisfies Record<DisputePath, string>;

const shortRef = (id: string): string => id.slice(-8);

/**
 * Organization Assistance DISPUTES & EXCEPTIONS (`/billing/assistance/disputes`; Assistance A7): the Company owner's READ-ONLY
 * overview of the beneficiaries' disputes (reason, status, the Organization's answer, Core's only resolution path, the case's
 * collection and settlement context) and of the cases in each exception category, each linked to its A5 case page. A demo build
 * reads the simulated cases of Assistance A3 and says so; every other build says it is not available (CF-70). Nothing can be
 * corrected, resolved, collected, paid or confirmed here.
 */
@Component({
  selector: 'adm-assistance-disputes-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDataState,
    NwDatePipe,
    NwFormField,
    NwIcon,
    NwLink,
    NwNumberPipe,
    NwStatusBadge,
    AssistanceExceptionBadges,
    AssistanceSourceTag,
  ],
  templateUrl: './assistance-disputes.page.html',
  styleUrl: './assistance-disputes.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-disputes' },
})
export class AssistanceDisputesPage {
  protected readonly facade = inject(AssistanceDisputesFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  private readonly scope = inject(ScopeContext);

  protected readonly directoryPath = '/billing/assistance';
  protected readonly reasons = ASSISTANCE_DISPUTE_REASONS;
  protected readonly exceptions = ASSISTANCE_EXCEPTIONS;
  protected readonly reasonKeys = DISPUTE_REASON_KEYS;
  protected readonly positionKeys = POSITION_KEYS;
  protected readonly exceptionKeys = EXCEPTION_KEYS;
  protected readonly exceptionDescriptionKeys = EXCEPTION_DESCRIPTION_KEYS;
  protected readonly exceptionSource = EXCEPTION_SOURCE;
  protected readonly exceptionRestriction = EXCEPTION_RESTRICTION;
  protected readonly stateKeys = STATE_KEYS;
  protected readonly stateTones = STATE_TONES;
  protected readonly settlementKeys = SETTLEMENT_STAGE_KEYS;
  protected readonly settlementSources = STAGE_SOURCE.settlement;
  protected readonly pathKeys = PATH_KEYS;
  protected readonly correctableField = RESOLVABLE_DISPUTE_REASONS;
  protected readonly fieldKeys = {
    cashCollectedAt: 'assistanceCases.case.correction.field.cashCollectedAt',
    returnedAt: 'assistanceCases.case.correction.field.returnedAt',
  } as const;
  protected readonly shortRef = shortRef;

  /** The page-level state: both lists share one context, so either list's refusal is the page's. */
  protected readonly blocked = computed(() => {
    const status = this.facade.disputes().status;
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

  protected organizationLink(row: AssistanceCaseSummary): string {
    return organizationPath(row.platformId, row.organizationId);
  }

  protected platformLink(id: PlatformId): string {
    return platformPath(id);
  }

  protected pathOf(dispute: AssistanceDispute): DisputePath {
    if (dispute.state === 'resolved') return 'resolved';
    return RESOLVABLE_DISPUTE_REASONS[dispute.reason] === null ? 'noResolution' : 'correctionOnly';
  }

  protected settlementOf(row: AssistanceCaseSummary): SettlementStage {
    return assistanceOversight(row).settlement;
  }

  protected exceptionsOf(row: AssistanceCaseSummary): readonly AssistanceException[] {
    return assistanceExceptions(row);
  }

  protected trackDispute(row: AssistanceDisputeSummary): string {
    return row.dispute.id;
  }

  protected onState(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.facade.updateDisputes({ state: isAssistanceDisputeState(value) ? value : null });
  }

  protected onReason(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.facade.updateDisputes({ reason: isAssistanceDisputeReason(value) ? value : null });
  }

  protected onException(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (isAssistanceException(value)) this.facade.selectException(value);
  }
}
