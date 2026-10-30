import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext, organizationPath, platformPath } from '../../../core/context/scope-context';
import { PlatformId } from '../../../core/context/scope.model';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwIconName } from '../../../shared/ui/icon/icon.registry';
import { NwLink } from '../../../shared/ui/link/link';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import { AssistanceCaseFacade } from '../application/assistance-case.facade';
import {
  AssistanceTimelineActor,
  AssistanceTimelineEntry,
  RecoverySurplusStatus,
} from '../domain/assistance-read.model';
import {
  AssistanceDisputeReason,
  AssistanceInformationSource,
  AssistanceRequestState,
  CashReturnOrigin,
  CashReturnState,
  CorrectableField,
  CorrectionReason,
  LateSettlementAttestation,
  LateSettlementReason,
  RecoveryObligationState,
  SettlementChannelState,
} from '../domain/assistance.model';
import { RESOLVABLE_DISPUTE_REASONS, effectiveTime } from '../domain/assistance.rules';
import { assistanceOversight, oversightInputOfCase } from '../domain/assistance-oversight';
import { AssistanceMoneyPipe } from '../ui/assistance-money.pipe';
import { AssistanceOversightPanel } from '../ui/assistance-oversight-panel';
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

const CHANNEL_KEYS = {
  open: 'assistanceCases.channel.open',
  uncertain: 'assistanceCases.channel.uncertain',
  settled: 'assistanceCases.channel.settled',
  closed: 'assistanceCases.channel.closed',
} as const satisfies Record<SettlementChannelState, string>;

const SOURCE_ICONS = {
  fact: 'badge-check',
  report: 'clipboard-list',
  decision: 'user-cog',
  derived: 'refresh-cw',
} as const satisfies Record<AssistanceInformationSource, NwIconName>;

const ACTOR_KEYS = {
  beneficiary: 'assistanceCases.case.actor.beneficiary',
  organization_actor: 'assistanceCases.case.actor.organizationActor',
  owner: 'assistanceCases.case.actor.owner',
  core: 'assistanceCases.case.actor.core',
} as const satisfies Record<AssistanceTimelineActor, string>;

const KIND_KEYS = {
  settlementSucceeded: 'assistanceCases.case.kind.settlementSucceeded',
  settlementFailed: 'assistanceCases.case.kind.settlementFailed',
  lateSuccess: 'assistanceCases.case.kind.lateSuccess',
  refundCompleted: 'assistanceCases.case.kind.refundCompleted',
  chargebackFinal: 'assistanceCases.case.kind.chargebackFinal',
  recoveryPayment: 'assistanceCases.case.kind.recoveryPayment',
  consent: 'assistanceCases.case.kind.consent',
  declined: 'assistanceCases.case.kind.declined',
  cashCollected: 'assistanceCases.case.kind.cashCollected',
  cashReturnReported: 'assistanceCases.case.kind.cashReturnReported',
  cashReturnConfirmed: 'assistanceCases.case.kind.cashReturnConfirmed',
  disputeOpened: 'assistanceCases.case.kind.disputeOpened',
  disputeResponse: 'assistanceCases.case.kind.disputeResponse',
  lateAttestation: 'assistanceCases.case.kind.lateAttestation',
  correction: 'assistanceCases.case.kind.correction',
  disputeResolved: 'assistanceCases.case.kind.disputeResolved',
  lateSettlementApplied: 'assistanceCases.case.kind.lateSettlementApplied',
  writeOff: 'assistanceCases.case.kind.writeOff',
  surplusExternal: 'assistanceCases.case.kind.surplusExternal',
  cashReturnOwed: 'assistanceCases.case.kind.cashReturnOwed',
  channelUncertain: 'assistanceCases.case.kind.channelUncertain',
  channelClosed: 'assistanceCases.case.kind.channelClosed',
  recoveryOpened: 'assistanceCases.case.kind.recoveryOpened',
} as const satisfies Record<AssistanceTimelineEntry['kind'], string>;

const RETURN_STATE_KEYS = {
  open: 'assistanceCases.case.cashReturn.state.open',
  return_reported: 'assistanceCases.case.cashReturn.state.returnReported',
  confirmed_returned: 'assistanceCases.case.cashReturn.state.confirmedReturned',
  superseded_by_settlement: 'assistanceCases.case.cashReturn.state.supersededBySettlement',
} as const satisfies Record<CashReturnState, string>;

const RETURN_ORIGIN_KEYS = {
  deadline: 'assistanceCases.case.cashReturn.origin.deadline',
  refund_completion: 'assistanceCases.case.cashReturn.origin.refundCompletion',
} as const satisfies Record<CashReturnOrigin, string>;

const DISPUTE_REASON_KEYS = {
  cash_not_returned: 'assistanceCases.case.dispute.reason.cashNotReturned',
  collection_not_made: 'assistanceCases.case.dispute.reason.collectionNotMade',
  collection_time_incorrect: 'assistanceCases.case.dispute.reason.collectionTimeIncorrect',
  return_time_incorrect: 'assistanceCases.case.dispute.reason.returnTimeIncorrect',
} as const satisfies Record<AssistanceDisputeReason, string>;

const FIELD_KEYS = {
  cashCollectedAt: 'assistanceCases.case.correction.field.cashCollectedAt',
  returnedAt: 'assistanceCases.case.correction.field.returnedAt',
} as const satisfies Record<CorrectableField, string>;

const CORRECTION_REASON_KEYS = {
  actor_entry_error: 'assistanceCases.case.correction.reason.actorEntryError',
  evidence_contradicts_report: 'assistanceCases.case.correction.reason.evidenceContradictsReport',
} as const satisfies Record<CorrectionReason, string>;

const LATE_REASON_KEYS = {
  channel_closed: 'assistanceCases.case.late.reason.channelClosed',
  purchase_exists: 'assistanceCases.case.late.reason.purchaseExists',
  cash_return_obligation_exists: 'assistanceCases.case.late.reason.cashReturnObligationExists',
  request_not_settleable: 'assistanceCases.case.late.reason.requestNotSettleable',
} as const satisfies Record<LateSettlementReason, string>;

const ATTESTATION_KEYS = {
  cash_not_returned: 'assistanceCases.case.late.attestation.cashNotReturned',
  cash_returned: 'assistanceCases.case.late.attestation.cashReturned',
} as const satisfies Record<LateSettlementAttestation, string>;

const RECOVERY_STATE_KEYS = {
  open: 'assistanceCases.indicator.recoveryOpen',
  recovered: 'assistanceCases.indicator.recovered',
} as const satisfies Record<RecoveryObligationState, string>;

const SURPLUS_KEYS = {
  owed_to_organization: 'assistanceCases.case.recovery.surplus.owedToOrganization',
  external_execution_evidenced: 'assistanceCases.case.recovery.surplus.externalExecutionEvidenced',
  resolved: 'assistanceCases.case.recovery.surplus.resolved',
} as const satisfies Record<RecoverySurplusStatus, string>;

const DECLINED_KEYS = {
  beneficiary: 'assistanceCases.case.actor.beneficiary',
  organization_actor: 'assistanceCases.case.actor.organizationActor',
} as const;

/** The last characters of a Core id; the full id is always available to assistive technology and as a tooltip. */
const shortRef = (id: string): string => id.slice(-8);

/**
 * One Organization Assistance case (`/billing/assistance/:requestId`; Assistance A5): the Company owner's READ-ONLY view of
 * the request, its frozen terms, the Organization's collection report, the settlement channel, cash returns, disputes and
 * owner corrections, late settlements, recovery and surpluses, Core's restrictions, and a history that keeps verified facts,
 * reports, owner decisions and Core-derived states apart. A report is never shown as a payment. Nothing can be decided,
 * collected, paid, corrected or written off here. Demo builds show simulated cases and say so; other builds: not available.
 */
@Component({
  selector: 'adm-assistance-case-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwDataState,
    NwDatePipe,
    NwIcon,
    NwLink,
    NwStatusBadge,
    AssistanceMoneyPipe,
    AssistanceOversightPanel,
    AssistanceSourceTag,
  ],
  templateUrl: './assistance-case.page.html',
  styleUrl: './assistance-case.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-case' },
})
export class AssistanceCasePage {
  protected readonly facade = inject(AssistanceCaseFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  private readonly scope = inject(ScopeContext);

  protected readonly directoryPath = '/billing/assistance';
  protected readonly stateKeys = STATE_KEYS;
  protected readonly stateTones = STATE_TONES;
  protected readonly channelKeys = CHANNEL_KEYS;
  protected readonly sources: readonly AssistanceInformationSource[] = [
    'fact',
    'report',
    'decision',
    'derived',
  ];
  protected readonly sourceIcons = SOURCE_ICONS;
  protected readonly actorKeys = ACTOR_KEYS;
  protected readonly kindKeys = KIND_KEYS;
  protected readonly returnStateKeys = RETURN_STATE_KEYS;
  protected readonly returnOriginKeys = RETURN_ORIGIN_KEYS;
  protected readonly disputeReasonKeys = DISPUTE_REASON_KEYS;
  protected readonly fieldKeys = FIELD_KEYS;
  protected readonly correctionReasonKeys = CORRECTION_REASON_KEYS;
  protected readonly lateReasonKeys = LATE_REASON_KEYS;
  protected readonly attestationKeys = ATTESTATION_KEYS;
  protected readonly recoveryStateKeys = RECOVERY_STATE_KEYS;
  protected readonly surplusKeys = SURPLUS_KEYS;
  protected readonly declinedKeys = DECLINED_KEYS;
  protected readonly resolvable = RESOLVABLE_DISPUTE_REASONS;
  protected readonly shortRef = shortRef;
  protected readonly organizationPath = organizationPath;
  protected readonly platformPath = platformPath;

  /** The case's oversight (A6), read from the same records the sections show. */
  protected readonly oversight = computed(() => {
    const view = this.facade.view();
    if (view.status !== 'ready') return null;
    const { detail, lateSettlements, recovery } = view.record;
    return assistanceOversight(oversightInputOfCase(detail, lateSettlements, recovery));
  });

  protected readonly platformName = computed(() => {
    const platforms = this.scope.platforms();
    const names = new Map(
      platforms.status === 'success' ? platforms.data.map((p) => [p.id as string, p.name]) : [],
    );
    return (id: PlatformId): string | null => names.get(id) ?? null;
  });

  /** The collection time in force: the latest owner correction of it, else the Organization's report. */
  protected collectedAt(original: string): string {
    const view = this.facade.view();
    const corrections = view.status === 'ready' ? view.record.detail.corrections : [];
    return effectiveTime(original, 'cashCollectedAt', corrections);
  }

  /** The return time in force, the same way. */
  protected returnedAt(original: string): string {
    const view = this.facade.view();
    const corrections = view.status === 'ready' ? view.record.detail.corrections : [];
    return effectiveTime(original, 'returnedAt', corrections);
  }
}
