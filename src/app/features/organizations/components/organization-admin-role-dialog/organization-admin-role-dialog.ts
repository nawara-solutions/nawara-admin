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
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { APP_ENVIRONMENT } from '../../../../core/config/app-environment';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { isolated } from '../../../platforms/domain/create-platform.model';
import {
  type OrganizationAdminRoleAction,
  roleFailureKey,
  roleReconciles,
} from '../../application/organization-admin-role.action';
import { ListableMembershipStatus, memberIdentity } from '../../domain/membership.model';

/** Catalog keys, listed in full (never built at runtime): the detail page's wording of each status. */
const STATUS_KEYS = {
  active: 'organizations.members.status.active',
  pending: 'organizations.members.detail.statusPending',
  rejected: 'organizations.members.status.rejected',
} as const satisfies Record<ListableMembershipStatus, string>;

/**
 * "Make this member an organization admin?" / "Remove the organization-admin role?" (P5-S3 design, artboards 4–6, 9):
 * the confirmation (removal is an alertdialog with focus on Cancel), then the owner's verification for the direction's
 * purpose (a code or a passkey; the secret key is not accepted), then pending (the dialog cannot be closed), then the
 * result. Success closes it (the page confirms with a toast). Granting warns about an unverified contact and removing
 * about the last listed admin; neither is blocked, as in Core. After a `404` or a lost answer the lists are reloaded and
 * the dialog says what they show.
 */
@Component({
  selector: 'adm-organization-admin-role-dialog',
  imports: [
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDialog,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
  ],
  templateUrl: './organization-admin-role-dialog.html',
  styleUrl: './organization-admin-role-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationAdminRoleDialog {
  protected readonly action = inject<OrganizationAdminRoleAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.action.run.state;
  protected readonly input = this.action.current()!;
  protected readonly membership = this.input.membership;
  protected readonly grant = this.input.admin;
  protected readonly who = memberIdentity(this.membership);
  protected readonly isolatedOrganization = isolated(this.input.target.organizationName);
  protected readonly statusKeys = STATUS_KEYS;
  protected readonly reconciliation = this.action.reconciliation;
  /** Removing the only admin the loaded Active list shows: a warning, never a block (Core has no such rule). */
  protected readonly lastAdmin = !this.grant && (this.action.members.adminCount() ?? 0) <= 1;
  protected readonly code = signal('');
  protected readonly demoCode = signal<string | null>(null);

  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly mainButton = viewChild('mainButton', { read: ElementRef<HTMLButtonElement> });

  protected readonly failure = computed(() => {
    const state = this.state();
    if (state.phase === 'failed') return state.failure;
    if (state.phase === 'verifying') return state.failure;
    return null;
  });
  protected readonly failureKey = computed(() => {
    const failure = this.failure();
    return failure ? roleFailureKey(failure) : null;
  });
  protected readonly reconciling = computed(() => {
    const state = this.state();
    return state.phase === 'failed' && roleReconciles(state.failure);
  });
  /**
   * "Try again" (a new verification): only where nothing was applied (Core refused first, or the verification was
   * refused), or once a reload shows the membership still active with its old role.
   */
  protected readonly retryable = computed(() => {
    const state = this.state();
    if (state.phase !== 'failed') return false;
    const kind = state.failure.kind;
    if (kind === 'unavailable' || kind === 'rateLimited' || kind === 'verificationRefused')
      return true;
    const known = this.reconciliation();
    return (
      kind === 'outcomeUnknown' &&
      known?.state === 'known' &&
      known.status === 'active' &&
      known.isOrganizationAdmin === !this.grant
    );
  });
  protected readonly busy = computed(() => {
    const state = this.state();
    return state.phase === 'pending' || (state.phase === 'verifying' && state.busy);
  });

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then((bindings) => this.demoCode.set(bindings.signIn.code));

    let previous = '';
    effect(() => {
      const state = this.state();
      if (state.phase === 'succeeded' || state.phase === 'closed') {
        this.ref.close();
        return;
      }
      const step =
        state.phase === 'verifying'
          ? `verifying:${state.busy}:${state.failure?.kind ?? ''}`
          : state.phase;
      if (step === previous) return;
      previous = step;
      afterNextRender(() => this.focusFor(state.phase), { injector: this.injector });
    });
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected confirm(): void {
    this.action.run.submit(this.input);
  }

  protected verify(event: Event): void {
    event.preventDefault();
    this.action.run.verify({ method: 'totp', code: this.code() });
  }

  protected back(): void {
    this.action.run.back();
  }

  protected tryAgain(): void {
    this.code.set('');
    this.action.run.retry();
  }

  protected checkStatus(): void {
    this.action.checkStatus();
  }

  protected close(): void {
    if (this.busy()) return;
    this.ref.close();
  }

  private focusFor(phase: string): void {
    if (phase === 'verifying' && !this.busy()) this.codeInput()?.nativeElement.focus();
    else if (phase === 'failed') this.mainButton()?.nativeElement.focus();
  }
}
