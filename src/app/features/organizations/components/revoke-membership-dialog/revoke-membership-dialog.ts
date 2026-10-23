import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
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
import { TranslocoPipe } from '@jsverse/transloco';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { isolated } from '../../../platforms/domain/create-platform.model';
import {
  type MembershipRevokeAction,
  revokeFailureKey,
  revokeReconciles,
} from '../../application/membership-revoke.action';
import { ListableMembershipStatus, memberIdentity } from '../../domain/membership.model';

/** Catalog keys, listed in full (never built at runtime): the detail page's wording of each status. */
const STATUS_KEYS = {
  active: 'organizations.members.status.active',
  pending: 'organizations.members.detail.statusPending',
  rejected: 'organizations.members.status.rejected',
} as const satisfies Record<ListableMembershipStatus, string>;

/**
 * "Revoke this membership?" (P5-S3 design, artboards 3, 6): a destructive confirmation (an alertdialog, focus on
 * Cancel) that says what is removed (access to this Organization; the organization-admin role, when present) and what
 * is not (the Nawara account, other memberships, subscriptions and payments, the account as a whole); then pending
 * (the dialog cannot be closed), then the result. Success closes it (the page confirms with a toast). After a lost
 * answer, a `409` or a `404` the lists are reloaded and the dialog says only what they show: a membership no longer
 * listed as active may have been revoked, which revoked memberships, being unlisted, cannot prove.
 */
@Component({
  selector: 'adm-revoke-membership-dialog',
  imports: [TranslocoPipe, NwButton, NwDatePipe, NwDialog, NwIcon, NwInlineAlert, NwSpinner],
  templateUrl: './revoke-membership-dialog.html',
  styleUrl: './revoke-membership-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RevokeMembershipDialog {
  protected readonly action = inject<MembershipRevokeAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.action.run.state;
  protected readonly input = this.action.current()!;
  protected readonly membership = this.input.membership;
  protected readonly who = memberIdentity(this.membership);
  protected readonly isolatedOrganization = isolated(this.input.target.organizationName);
  protected readonly statusKeys = STATUS_KEYS;
  protected readonly reconciliation = this.action.reconciliation;
  protected readonly byOperator = this.action.byOperator;

  private readonly mainButton = viewChild('mainButton', { read: ElementRef<HTMLButtonElement> });

  protected readonly failure = computed(() => {
    const state = this.state();
    return state.phase === 'failed' ? state.failure : null;
  });
  protected readonly failureKey = computed(() => {
    const failure = this.failure();
    return failure ? revokeFailureKey(failure) : null;
  });
  protected readonly reconciling = computed(() => {
    const failure = this.failure();
    return failure !== null && revokeReconciles(failure);
  });
  /** "Try again": only where nothing was applied (Core refused first), or once a reload shows it still active. */
  protected readonly retryable = computed(() => {
    const failure = this.failure();
    if (failure === null) return false;
    if (failure.kind === 'unavailable' || failure.kind === 'rateLimited') return true;
    const known = this.reconciliation();
    return (
      failure.kind === 'outcomeUnknown' && known?.state === 'known' && known.status === 'active'
    );
  });
  protected readonly busy = computed(() => this.state().phase === 'pending');

  constructor() {
    let previous = '';
    effect(() => {
      const state = this.state();
      if (state.phase === 'succeeded' || state.phase === 'closed') {
        this.ref.close();
        return;
      }
      if (state.phase === previous) return;
      previous = state.phase;
      if (state.phase === 'failed')
        afterNextRender(() => this.mainButton()?.nativeElement.focus(), {
          injector: this.injector,
        });
    });
  }

  protected confirm(): void {
    this.action.run.submit(this.input);
  }

  protected tryAgain(): void {
    this.action.run.retry();
  }

  protected checkStatus(): void {
    this.action.checkStatus();
  }

  protected close(): void {
    if (this.busy()) return;
    this.ref.close();
  }
}
