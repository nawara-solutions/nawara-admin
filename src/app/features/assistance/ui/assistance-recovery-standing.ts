import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwStatusBadge, NwStatusTone } from '../../../shared/ui/status-badge/status-badge';
import {
  RecoveryHistoryEntry,
  SURPLUS_STAGE_SOURCE,
  SurplusStage,
  recoveryHistory,
  recoveryStanding,
  surplusStage,
} from '../domain/assistance-recovery';
import { RecoveryObligationDetail, RecoverySurplusView } from '../domain/assistance-read.model';
import { Money } from '../domain/assistance.model';
import { AssistanceMoneyPipe } from './assistance-money.pipe';
import { AssistanceSourceTag } from './assistance-source-tag';

/** Catalog keys, listed in full (never built at runtime). */
const SURPLUS_KEYS = {
  owed: 'assistanceCases.case.recovery.surplus.owedToOrganization',
  externalRecorded: 'assistanceCases.recovery.surplus.externalRecorded',
  confirmed: 'assistanceCases.recovery.surplus.confirmed',
  refunded: 'assistanceCases.recovery.surplus.refunded',
} as const satisfies Record<SurplusStage, string>;

const SURPLUS_TONES = {
  owed: 'warning',
  externalRecorded: 'info',
  confirmed: 'success',
  refunded: 'success',
} as const satisfies Record<SurplusStage, NwStatusTone>;

const HISTORY_KEYS = {
  opened: 'assistanceCases.recovery.history.opened',
  channel: 'assistanceCases.recovery.history.channel',
  payment: 'assistanceCases.recovery.history.payment',
  surplus: 'assistanceCases.recovery.history.surplus',
  recovered: 'assistanceCases.recovery.history.recovered',
  surplusExternal: 'assistanceCases.recovery.history.surplusExternal',
  surplusConfirmed: 'assistanceCases.recovery.history.surplusConfirmed',
} as const satisfies Record<RecoveryHistoryEntry['kind'], string>;

const shortRef = (id: string): string => id.slice(-8);

/**
 * One recovery obligation's standing (Assistance A9): what the Organization OWES (the base, and what is outstanding, Core's values),
 * what was RECOVERED (Payment-verified payments only, each split by Core into principal and surplus), what is PAYABLE TO the
 * Organization (its surpluses and where each is on Core's two resolution paths), the settlement attempts (channels: never a recovery
 * on their own), and the history. READ ONLY: no button, form or receipt; no amount is computed.
 */
@Component({
  selector: 'adm-assistance-recovery-standing',
  imports: [TranslocoPipe, NwDatePipe, NwStatusBadge, AssistanceMoneyPipe, AssistanceSourceTag],
  templateUrl: './assistance-recovery-standing.html',
  styleUrl: './assistance-recovery-standing.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'assistance-recovery-standing',
    '[attr.data-recovery-state]': 'obligation().state',
  },
})
export class AssistanceRecoveryStanding {
  readonly obligation = input.required<RecoveryObligationDetail>();
  /** `false` where the host already shows base, recovered and outstanding (the A5 case page). */
  readonly showSummary = input(true);
  /** The level of this standing's subheadings, one below its host's heading (4 under an overview card, 3 in a case section). */
  readonly headingLevel = input(4);

  protected readonly surplusKeys = SURPLUS_KEYS;
  protected readonly surplusTones = SURPLUS_TONES;
  protected readonly surplusSources = SURPLUS_STAGE_SOURCE;
  protected readonly historyKeys = HISTORY_KEYS;
  protected readonly shortRef = shortRef;

  protected readonly standing = computed(() => recoveryStanding(this.obligation()));
  protected readonly history = computed(() => recoveryHistory(this.obligation()));

  protected stageOf(s: RecoverySurplusView): SurplusStage {
    return surplusStage(s);
  }

  /** An amount Core states in the obligation's minor units, with its currency (never converted). */
  protected money(amount: number): Money {
    return { amount, currency: this.obligation().base.currency };
  }
}
