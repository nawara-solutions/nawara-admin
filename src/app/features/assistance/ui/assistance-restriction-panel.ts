import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwLink } from '../../../shared/ui/link/link';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { AssistanceRestrictionsRead } from '../application/assistance-case.facade';
import { AssistanceCaseDetail } from '../domain/assistance-read.model';
import {
  NOT_RESTRICTIONS,
  NotARestriction,
  RESTRICTION_ENDS,
  RESTRICTION_SINCE,
  RESTRICTION_SOURCE,
  RestrictionRelation,
  restrictionCasePath,
  restrictionRelation,
} from '../domain/assistance-restrictions';
import { AssistanceRestriction, AssistanceRestrictionRow } from '../domain/assistance.model';
import { AssistanceSourceTag } from './assistance-source-tag';

/** Catalog keys, listed in full (never built at runtime). */
const KIND_KEYS = {
  T1: 'assistanceCases.case.restriction.t1',
  T2: 'assistanceCases.case.restriction.t2',
  T3: 'assistanceCases.case.restriction.t3',
} as const satisfies Record<AssistanceRestriction, string>;

const SOURCE_KEYS = {
  request: 'assistanceCases.restrictions.source.request',
  cashReturn: 'assistanceCases.restrictions.source.cashReturn',
  recovery: 'assistanceCases.restrictions.source.recovery',
} as const satisfies Record<(typeof RESTRICTION_SOURCE)[AssistanceRestriction], string>;

const SINCE_KEYS = {
  deadlinePassed: 'assistanceCases.restrictions.since.deadlinePassed',
  obligationOpened: 'assistanceCases.restrictions.since.obligationOpened',
} as const satisfies Record<(typeof RESTRICTION_SINCE)[AssistanceRestriction], string>;

const ENDS_KEYS = {
  settledOrReturned: 'assistanceCases.oversight.clears.settledOrReturned',
  returnConfirmedOrSuperseded: 'assistanceCases.oversight.clears.returnConfirmedOrSuperseded',
  principalRecovered: 'assistanceCases.oversight.clears.principalRecovered',
} as const satisfies Record<(typeof RESTRICTION_ENDS)[AssistanceRestriction], string>;

const RELATION_KEYS = {
  thisCase: 'assistanceCases.restrictions.relation.thisCase',
  otherCase: 'assistanceCases.restrictions.relation.otherCase',
} as const satisfies Record<RestrictionRelation, string>;

const NOT_KEYS = {
  assistanceDispute: 'assistanceCases.restrictions.not.assistanceDispute',
  paymentDispute: 'assistanceCases.restrictions.not.paymentDispute',
  fraudHold: 'assistanceCases.restrictions.not.fraudHold',
  inactivity: 'assistanceCases.restrictions.not.inactivity',
} as const satisfies Record<NotARestriction, string>;

/** The last characters of a Core id; the full id stays available as a tooltip and to assistive technology. */
const shortRef = (id: string): string => id.slice(-8);

/**
 * Core's restrictions on a case's Organization (Assistance A10), row by row as BIL-26 states them: the kind (its letters, never a
 * colour alone), what it means, the record it rests on (this case, or another case of the Organization), since when, and how Core
 * ends it. Then what is NOT a restriction (an assistance dispute, a Payment dispute, a fraud hold, D6). Read only: it derives, lifts
 * or predicts nothing. A failed read says so and never reads as "no restriction".
 */
@Component({
  selector: 'adm-assistance-restriction-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwDatePipe,
    NwIcon,
    NwLink,
    NwStatusBadge,
    AssistanceSourceTag,
  ],
  templateUrl: './assistance-restriction-panel.html',
  styleUrl: './assistance-restriction-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-restriction' },
})
export class AssistanceRestrictionPanel {
  readonly read = input.required<AssistanceRestrictionsRead>();
  readonly detail =
    input.required<
      Pick<AssistanceCaseDetail, 'request' | 'cashReturns' | 'recoveryObligationId'>
    >();
  /** The history state of a link to another case (A11: it keeps the case page's way back). */
  readonly linkState = input<Record<string, string> | null>(null);

  protected readonly kindKeys = KIND_KEYS;
  protected readonly sourceKeys = SOURCE_KEYS;
  protected readonly sinceKeys = SINCE_KEYS;
  protected readonly endsKeys = ENDS_KEYS;
  protected readonly relationKeys = RELATION_KEYS;
  protected readonly notKeys = NOT_KEYS;
  protected readonly notRestrictions = NOT_RESTRICTIONS;
  protected readonly source = RESTRICTION_SOURCE;
  protected readonly since = RESTRICTION_SINCE;
  protected readonly ends = RESTRICTION_ENDS;
  protected readonly shortRef = shortRef;

  protected relationOf(row: AssistanceRestrictionRow): RestrictionRelation {
    return restrictionRelation(row, this.detail());
  }

  /** Another case's page, only for a T1 row (its source is a request id); never for this case. */
  protected casePath(row: AssistanceRestrictionRow): string | null {
    return this.relationOf(row) === 'otherCase' ? restrictionCasePath(row) : null;
  }
}
