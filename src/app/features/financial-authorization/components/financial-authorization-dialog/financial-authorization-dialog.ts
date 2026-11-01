import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { failureKey } from '../../../../core/actions/action-failure';
import { RECEIPT_OPERATION_PURPOSE } from '../../../../core/authorization/purpose-registry';
import { RECEIPT_AUDIENCE } from '../../../../core/authorization/receipt.model';
import { APP_ENVIRONMENT } from '../../../../core/config/app-environment';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NW_FORMATTING_LOCALE } from '../../../../shared/format/formatting-locale';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { NwStepUpCode } from '../../../../shared/ui/step-up-code/step-up-code';
import type { FinancialAuthorizationDialogData } from '../../application/financial-authorization.dialogs';
import {
  OPERATION_PURPOSE_KEYS,
  OPERATION_TITLE_KEYS,
  REFUSAL_KEYS,
  SummaryValue,
  ViewAction,
  ViewTone,
  bindingSummary,
  financialAuthorizationView,
} from '../../domain/financial-authorization.view';

/** How often the dialog asks the run whether an unsubmitted receipt has expired (Core's `expiresAt`). */
export const FINANCIAL_AUTHORIZATION_TICK_MS = new InjectionToken<number>(
  'FINANCIAL_AUTHORIZATION_TICK_MS',
  { factory: () => 1000 },
);

const TONE_ICONS = {
  neutral: 'minus',
  progress: 'hourglass',
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-alert',
} as const satisfies Record<ViewTone, NwIconName>;

const ACTION_KEYS = {
  discard: 'financialAuthorization.actions.discard',
  startAgain: 'financialAuthorization.actions.startAgain',
  reconcile: 'financialAuthorization.actions.reconcile',
  replayIssue: 'financialAuthorization.actions.replayIssue',
  repeatIdentical: 'financialAuthorization.actions.repeatIdentical',
  submit: 'financialAuthorization.actions.submit',
  verify: 'financialAuthorization.actions.verify',
} as const satisfies Record<ViewAction, string>;

const moneyFormats = new Map<string, Intl.NumberFormat>();

/**
 * The financial authorization dialog (F1-S6b): one receipt operation, its target, the owner's authenticator code
 * (`nw-step-up-code`), then the AUTHORIZATION (the receipt) and the FINANCIAL RESULT (the consumer's answer) as two separate
 * lines, so an issued receipt is never read as a payment, refund or settlement.
 *
 * It drives the F1-S5 `FinancialAuthorizationRun` through `FinancialAuthorizationControls` and owns only the typed code, focus
 * and timers. Leaving it (Close, Escape, the page going away) cancels the intent: the run discards the secret; a command already
 * sent is not recalled. Every session or scope change, and Core's `expiresAt`, is checked by the run.
 */
@Component({
  selector: 'adm-financial-authorization-dialog',
  imports: [
    TranslocoPipe,
    NwButton,
    NwDatePipe,
    NwDialog,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
    NwStepUpCode,
  ],
  templateUrl: './financial-authorization-dialog.html',
  styleUrl: './financial-authorization-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancialAuthorizationDialog {
  protected readonly data = inject<FinancialAuthorizationDialogData>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);
  private readonly locale = inject(NW_FORMATTING_LOCALE);

  protected readonly run = this.data.run;
  protected readonly operation = this.data.operation;
  protected readonly purpose = RECEIPT_OPERATION_PURPOSE[this.operation];
  protected readonly audience = RECEIPT_AUDIENCE[this.operation];
  protected readonly summary = bindingSummary(this.data.binding);
  protected readonly gate = this.data.gate;

  protected readonly code = signal('');
  /** The demo code (demo builds only, from the demo bindings; never in a production bundle). */
  protected readonly demoCode = signal<string | null>(null);
  /** Issuance asked for the factor again (nothing was issued): say so above the field. */
  protected readonly askedAgain = signal(false);

  private readonly stepUp = viewChild(NwStepUpCode);
  private readonly main = viewChild('mainAction', { read: ElementRef<HTMLButtonElement> });
  private readonly dismissButton = viewChild('dismissAction', {
    read: ElementRef<HTMLButtonElement>,
  });

  protected readonly view = computed(() =>
    financialAuthorizationView({
      authorization: this.run.authorization(),
      outcome: this.run.outcome(),
      busy: this.run.busy(),
      canRepeatIdentical: this.run.canRepeatIdentical(),
      canReconcile: this.data.reconcilable,
    }),
  );

  protected readonly busy = computed(() => this.run.busy());

  /** The message to announce now, by urgency (empty when there is none of that kind). */
  protected readonly urgent = computed(() => {
    const message = this.view().message;
    return message !== null && (message.tone === 'danger' || message.tone === 'warning')
      ? message.key
      : '';
  });
  protected readonly polite = computed(() => {
    const message = this.view().message;
    return message !== null && message.tone !== 'danger' && message.tone !== 'warning'
      ? message.key
      : '';
  });

  protected readonly codeError = computed(() => {
    const state = this.run.authorization();
    return state.step === 'awaitingFactor' && state.failure !== null
      ? failureKey(state.failure)
      : null;
  });

  protected readonly retryAfter = computed(() => {
    const state = this.run.authorization();
    return state.step === 'awaitingFactor' && state.failure?.kind === 'rateLimited'
      ? state.failure.retryAfterSeconds
      : undefined;
  });

  protected readonly expiresAt = computed(() => {
    const state = this.run.authorization();
    return state.step === 'issued' ? state.expiresAt : null;
  });

  protected readonly receiptId = computed(() => {
    const state = this.run.authorization();
    return state.step === 'issued' || state.step === 'consumed' ? state.receiptId : null;
  });

  protected readonly titleKey = OPERATION_TITLE_KEYS[this.operation];
  protected readonly purposeKey = OPERATION_PURPOSE_KEYS[this.operation];
  protected readonly refusalKey = computed(() =>
    this.gate.allowed ? null : REFUSAL_KEYS[this.gate.reason],
  );
  protected readonly icons = TONE_ICONS;
  protected readonly actionKeys = ACTION_KEYS;

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then((bindings) => this.demoCode.set(bindings.signIn.code));

    if (this.gate.allowed) this.run.open(this.data.binding);

    // Leaving the dialog ends the intent and discards its secret.
    inject(DestroyRef).onDestroy(() => this.run.cancel());

    // A sign-out, another account or another scope ends the intent (the run compares its captured context).
    effect(() => {
      this.data.context();
      untracked(() => this.run.checkContext());
    });

    // Core's `expiresAt`: an unsubmitted receipt is discarded the moment it expires, never sent afterwards.
    const tick = setInterval(() => this.run.checkExpiry(), inject(FINANCIAL_AUTHORIZATION_TICK_MS));
    inject(DestroyRef).onDestroy(() => clearInterval(tick));

    let previous = '';
    effect(() => {
      const authorization = this.run.authorization();
      const outcome = this.run.outcome();
      const busy = this.run.busy();
      const step = `${authorization.step}:${outcome.status}:${String(busy)}:${
        authorization.step === 'awaitingFactor' ? (authorization.failure?.kind ?? '') : ''
      }`;
      if (step === previous) return;
      const [before] = previous.split(':');
      previous = step;
      if (authorization.step === 'awaitingFactor' && before === 'issuing') {
        // Issuance refused the proof without issuing anything: a fresh code is needed.
        this.askedAgain.set(true);
        this.code.set('');
      } else if (authorization.step !== 'awaitingFactor' && authorization.step !== 'verifying') {
        this.askedAgain.set(false);
      }
      if (busy) return;
      afterNextRender(() => this.focusFor(authorization.step), { injector: this.injector });
    });
  }

  protected act(action: ViewAction, event?: Event): void {
    event?.preventDefault();
    switch (action) {
      case 'verify':
        this.run.verify({ method: 'totp', code: this.code() });
        return;
      case 'replayIssue':
        this.run.replayIssue();
        return;
      case 'submit':
        this.run.submit();
        return;
      case 'repeatIdentical':
        this.run.repeatIdentical();
        return;
      case 'reconcile':
        this.run.reconcile();
        return;
      case 'discard':
        this.run.cancel();
        return;
      case 'startAgain':
        this.code.set('');
        this.run.open(this.data.binding);
        return;
    }
  }

  protected dismiss(): void {
    if (this.busy()) return;
    this.ref.close();
  }

  protected flag(value: SummaryValue): boolean {
    return value.kind === 'flag' && value.value;
  }

  protected machineValue(value: SummaryValue): string {
    return value.kind === 'id' || value.kind === 'code' ? value.value : '';
  }

  protected money(value: SummaryValue): string {
    if (value.kind !== 'money') return '';
    const key = `${this.locale()}|${value.currency}`;
    let format = moneyFormats.get(key);
    if (!format) {
      format = new Intl.NumberFormat(this.locale(), {
        style: 'currency',
        currency: value.currency,
        currencyDisplay: 'code',
      });
      moneyFormats.set(key, format);
    }
    const digits = format.resolvedOptions().maximumFractionDigits ?? 0;
    return format.format(value.amount / 10 ** digits);
  }

  private focusFor(step: string): void {
    if (step === 'awaitingFactor') this.stepUp()?.focus();
    else (this.main() ?? this.dismissButton())?.nativeElement.focus();
  }
}
