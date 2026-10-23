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
import { failureKey, retryOf } from '../../../../core/actions/action-failure';
import { APP_ENVIRONMENT } from '../../../../core/config/app-environment';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import type { CreatePlatformAction } from '../../application/create-platform.action';
import {
  PLATFORM_NAME_MAX,
  isolated,
  platformNameProblem,
} from '../../domain/create-platform.model';

const NAME_PROBLEM_KEYS = {
  required: 'platforms.create.nameRequired',
  tooLong: 'platforms.create.nameTooLong',
} as const;

/**
 * The "Create platform" dialog (P4 design, artboards 1, 3–8): the name (a standard confirmation: the button names the
 * verb), then the owner's simulated verification for `platform.create`, then pending and the result. Driven by the
 * action's `ActionRun`; it owns only the typed values and focus. While the command runs it cannot be dismissed
 * (`nw-dialog` busy); leaving the page closes it without cancelling the command, whose result is then a toast.
 */
@Component({
  selector: 'adm-create-platform-dialog',
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
  templateUrl: './create-platform-dialog.html',
  styleUrl: './create-platform-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePlatformDialog {
  protected readonly action = inject<CreatePlatformAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.action.run.state;
  protected readonly maxLength = PLATFORM_NAME_MAX;
  protected readonly name = signal('');
  protected readonly code = signal('');
  /** The client-side check, shown once the person tried to submit. */
  private readonly submitted = signal(false);
  /** The demo verification code (demo builds only, from the demo bindings; never in a production bundle). */
  protected readonly demoCode = signal<string | null>(null);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly mainButton = viewChild<ElementRef<HTMLButtonElement>>('mainButton');

  protected readonly isolatedName = computed(() => isolated(this.name().trim()));

  protected readonly nameError = computed(() => {
    const problem = this.submitted() ? platformNameProblem(this.name()) : null;
    return problem ? NAME_PROBLEM_KEYS[problem] : null;
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    if (state.phase === 'failed') return state.failure;
    if (state.phase === 'verifying') return state.failure;
    return null;
  });

  protected readonly failureKey = computed(() => {
    const failure = this.failure();
    return failure ? failureKey(failure) : null;
  });

  protected readonly retryAfter = computed(() => {
    const failure = this.failure();
    return failure?.kind === 'rateLimited' ? failure.retryAfterSeconds : undefined;
  });

  /** A refusal of the request itself (not of the field): shown as an alert with Close, and Try again when it helps. */
  protected readonly retry = computed(() => {
    const state = this.state();
    return state.phase === 'failed' ? retryOf(state.failure) : 'none';
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

  protected onName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    if (platformNameProblem(this.name()) !== null) {
      this.nameInput()?.nativeElement.focus();
      return;
    }
    const companyId = this.action.companyId();
    if (companyId === null) return;
    this.code.set('');
    this.action.run.submit({ companyId, name: this.name().trim() });
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

  protected cancel(): void {
    if (this.busy()) return;
    this.ref.close();
  }

  private focusFor(phase: string): void {
    if (phase === 'editing') this.nameInput()?.nativeElement.focus();
    else if (phase === 'verifying' && !this.busy()) this.codeInput()?.nativeElement.focus();
    else if (phase === 'failed') this.mainButton()?.nativeElement.focus();
  }
}
