import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext, organizationPath, platformPath } from '../../../core/context/scope-context';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { NwDatePipe, NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwLink } from '../../../shared/ui/link/link';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import {
  AssistanceRecoveryFacade,
  AssistanceRecoveryRow,
} from '../application/assistance-recovery.facade';
import { AssistanceRestriction } from '../domain/assistance.model';
import { AssistanceRecoveryStanding } from '../ui/assistance-recovery-standing';

/** Catalog keys, listed in full (never built at runtime). */
const RESTRICTION_KEYS = {
  T1: 'assistanceCases.case.restriction.t1',
  T2: 'assistanceCases.case.restriction.t2',
  T3: 'assistanceCases.case.restriction.t3',
} as const satisfies Record<AssistanceRestriction, string>;

const shortRef = (id: string): string => id.slice(-8);

/**
 * Organization Assistance RECOVERY & SURPLUS (`/billing/assistance/recovery`; Assistance A9): the Company owner's READ-ONLY oversight
 * of the recovery obligations Core opened after a verified full final chargeback of an assisted purchase (the base the Organization
 * owes, what Payment verified as recovered, what is outstanding), of the surpluses owed to Organizations (never revenue) and where
 * each is on Core's resolution paths, with the case's restrictions and late settlements, each linked to its A5 case page. A demo
 * build reads the simulated cases of Assistance A3 and says so; every other build says it is not available (CF-68). Nothing can be
 * settled, allocated, refunded, recorded, confirmed or written off here.
 */
@Component({
  selector: 'adm-assistance-recovery-page',
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
    AssistanceRecoveryStanding,
  ],
  templateUrl: './assistance-recovery.page.html',
  styleUrl: './assistance-recovery.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'assistance-recovery' },
})
export class AssistanceRecoveryPage {
  protected readonly facade = inject(AssistanceRecoveryFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  private readonly scope = inject(ScopeContext);

  protected readonly directoryPath = '/billing/assistance';
  protected readonly restrictionKeys = RESTRICTION_KEYS;
  protected readonly shortRef = shortRef;

  /** The page-level state: a refusal of the list is the page's. */
  protected readonly blocked = computed(() => {
    const status = this.facade.obligations().status;
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

  protected trackRow(row: AssistanceRecoveryRow): string {
    return row.obligation.id;
  }

  protected onState(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.facade.update({ state: value === 'open' || value === 'recovered' ? value : null });
  }

  protected onSurplus(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.facade.update({ surplusOwed: value === 'owed' ? true : null });
  }
}
