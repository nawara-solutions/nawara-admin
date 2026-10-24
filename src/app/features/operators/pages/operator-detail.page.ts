import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlatformId } from '../../../core/context/scope.model';
import { platformPath } from '../../../core/context/scope-context';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwSpinner } from '../../../shared/ui/spinner/spinner';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { OperatorDetailFacade } from '../application/operator-detail.facade';
import { OPERATORS_PATH } from '../application/operator-paths';
import { OperatorBlockAction } from '../application/operator-block.action';
import { PlatformAccessAction } from '../application/platform-access.action';
import { ACCOUNT_STATE_DISPLAY } from '../components/operator-list/operator-list';
import { OperatorsHeader } from '../components/operators-header/operators-header';
import { OperatorAccountState, OperatorSummary, contactText } from '../domain/operator.model';

/** What each account state means, said in words (catalog keys, listed in full). */
const STATE_DESCRIPTION_KEYS = {
  canSignIn: 'operators.detail.stateDescription.canSignIn',
  awaitingConfirmation: 'operators.detail.stateDescription.awaitingConfirmation',
  blocked: 'operators.detail.stateDescription.blocked',
} as const satisfies Record<OperatorAccountState, string>;

/**
 * One operator (`/operators/:operatorId`; P6 design, artboards Detail and MobileAr), read only: their account (demo
 * data, CF-03), their CURRENT Platform access and their REMOVED access, apart, with when it was given and removed and
 * by whom (the Company owner, as Core records it). The owner gives and removes Platform access here (P6-S2:
 * `PlatformAccessAction`); the other changes are listed as information only. After a change succeeds, focus moves to
 * the "Current Platform access" heading.
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
    NwSpinner,
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
  protected readonly access = inject(PlatformAccessAction);
  protected readonly block = inject(OperatorBlockAction);
  private readonly accountHeading = viewChild<ElementRef<HTMLElement>>('accountHeading');
  private readonly injector = inject(Injector);
  private readonly currentHeading = viewChild<ElementRef<HTMLElement>>('currentHeading');

  /** The Company's Platforms the operator has no active assignment on (the choices of "Give access"). */
  protected readonly eligible = computed(() =>
    this.facade.companyPlatforms().filter((p) => this.facade.isAssigned(p.id) === false),
  );

  constructor() {
    effect(() => {
      if (this.block.succeeded() === null) return;
      afterNextRender(() => this.accountHeading()?.nativeElement.focus(), {
        injector: this.injector,
      });
    });
    effect(() => {
      if (this.access.succeeded() === null) return;
      afterNextRender(() => this.currentHeading()?.nativeElement.focus(), {
        injector: this.injector,
      });
    });
  }

  /** Block (or unblock) the operator; the dialog names how many Platform assignments are kept. */
  protected openBlock(operator: OperatorSummary): void {
    const history = this.facade.historyView();
    this.block.open(operator, history.status === 'ready' ? history.current.length : 0);
  }

  protected giveAccess(operator: OperatorSummary): void {
    const platform = this.eligible()[0];
    if (platform === undefined) return;
    this.access.open({ operatorId: operator.id, contact: operator.contact, platform, grant: true });
  }

  protected removeAccess(operator: OperatorSummary, platformId: PlatformId): void {
    const platform = this.facade.companyPlatforms().find((p) => p.id === platformId);
    if (platform === undefined) return;
    this.access.open({
      operatorId: operator.id,
      contact: operator.contact,
      platform,
      grant: false,
    });
  }

  protected platformName(id: PlatformId): string | null {
    return this.facade.platformName(id);
  }
}
