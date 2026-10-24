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
import { PlatformRef } from '../../../../core/context/scope.model';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { isolated } from '../../../platforms/domain/create-platform.model';
import {
  type PlatformAccessAction,
  accessFailureKey,
  accessReconciles,
} from '../../application/platform-access.action';
import { contactText } from '../../domain/operator.model';

/**
 * "Give Platform access" / "Remove access to …?" (P6-S2 design, artboards 2–5, 7, 8): the choice or the confirmation
 * (removal is an alertdialog with focus on Cancel), then the owner's verification for the direction's purpose (the
 * authenticator code; Core also accepts a passkey or the secret key, which this version does not offer), then pending
 * (the dialog cannot be closed), then the result. Success closes it (the page confirms with a toast). Removal warns
 * about the operator's only Platform and about no other listed operator; neither is blocked (no such Core rule). After a
 * `409`, a `404`, a `503` or a lost answer the history is reloaded and the dialog says what it shows.
 */
@Component({
  selector: 'adm-platform-access-dialog',
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
  templateUrl: './platform-access-dialog.html',
  styleUrl: './platform-access-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformAccessDialog {
  protected readonly action = inject<PlatformAccessAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.action.run.state;
  protected readonly grant = this.action.current()!.grant;
  protected readonly contact = contactText(this.action.current()!.contact);
  /** The chosen Platform (a grant's choice can change while editing). */
  protected readonly platform = signal<PlatformRef>(this.action.current()!.platform);
  protected readonly isolatedPlatform = computed(() => isolated(this.platform().name));
  protected readonly reconciliation = this.action.reconciliation;
  /** The Company's Platforms with whether each is assigned now (a grant's choices). */
  protected readonly choices = computed(() =>
    this.action.detail.companyPlatforms().map((platform) => ({
      platform,
      assigned: this.action.detail.isAssigned(platform.id) !== false,
    })),
  );
  /** Removing the operator's only active Platform: a warning, never a block. */
  protected readonly onlyPlatform = computed(() => {
    const history = this.action.detail.historyView();
    return !this.grant && history.status === 'ready' && history.current.length === 1;
  });
  /** No other operator listed for the Platform in the (provisional) directory: a warning, never a block. */
  protected readonly lastListed = computed(() => !this.grant && this.action.otherOperators() === 0);
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
    return failure ? accessFailureKey(failure) : null;
  });
  protected readonly reconciling = computed(() => {
    const state = this.state();
    return state.phase === 'failed' && accessReconciles(state.failure);
  });
  /**
   * "Try again" (a new verification): after a rate limit or a refused verification, or once a reload shows the old
   * state (the Platform still unassigned for a grant, still active for a removal). Never offered while checking.
   */
  protected readonly retryable = computed(() => {
    const state = this.state();
    if (state.phase !== 'failed') return false;
    const kind = state.failure.kind;
    if (kind === 'rateLimited' || kind === 'verificationRefused') return true;
    if (!accessReconciles(state.failure)) return false;
    const known = this.reconciliation();
    return known?.state === 'known' && known.assigned === !this.grant;
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

  protected onChoose(platform: PlatformRef): void {
    this.action.choose(platform);
    const input = this.action.current();
    if (input) this.platform.set(input.platform);
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected confirm(): void {
    const input = this.action.current();
    if (input) this.action.run.submit(input);
  }

  protected verify(event: Event): void {
    event.preventDefault();
    this.action.run.verify({ method: 'totp', code: this.code() });
  }

  protected back(): void {
    this.action.run.back();
  }

  /** A new attempt: verified again (the earlier verification was used or never issued). */
  protected tryAgain(): void {
    const input = this.action.current();
    if (!input) return;
    this.code.set('');
    this.action.run.submit(input);
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
