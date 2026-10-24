import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlatformId } from '../../../core/context/scope.model';
import { platformPath } from '../../../core/context/scope-context';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { OperatorDetailFacade } from '../application/operator-detail.facade';
import { OPERATORS_PATH } from '../application/operator-paths';
import { ACCOUNT_STATE_DISPLAY } from '../components/operator-list/operator-list';
import { OperatorsHeader } from '../components/operators-header/operators-header';
import { OperatorAccountState, contactText } from '../domain/operator.model';

/** What each account state means, said in words (catalog keys, listed in full). */
const STATE_DESCRIPTION_KEYS = {
  canSignIn: 'operators.detail.stateDescription.canSignIn',
  awaitingConfirmation: 'operators.detail.stateDescription.awaitingConfirmation',
  blocked: 'operators.detail.stateDescription.blocked',
} as const satisfies Record<OperatorAccountState, string>;

/**
 * One operator (`/operators/:operatorId`; P6 design, artboards Detail and MobileAr), read only: their account (demo
 * data, CF-03), their CURRENT Platform access and their REMOVED access, apart, with when it was given and removed and
 * by whom (the Company owner, as Core records it). The changes Core supports, and the one it does not, are listed as
 * information only: P6-S1 has no control for them.
 */
@Component({
  selector: 'adm-operator-detail-page',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwDataState,
    NwDatePipe,
    NwIcon,
    NwStatusBadge,
    OperatorsHeader,
  ],
  templateUrl: './operator-detail.page.html',
  styleUrl: './operator-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'operator-detail' },
})
export class OperatorDetailPage {
  protected readonly facade = inject(OperatorDetailFacade);
  protected readonly directoryPath = OPERATORS_PATH;
  protected readonly platformPath = platformPath;
  protected readonly contact = contactText;
  protected readonly state = ACCOUNT_STATE_DISPLAY;
  protected readonly stateDescription = STATE_DESCRIPTION_KEYS;

  protected platformName(id: PlatformId): string | null {
    return this.facade.platformName(id);
  }
}
