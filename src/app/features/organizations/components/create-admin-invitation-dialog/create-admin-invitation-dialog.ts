import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { APP_ENVIRONMENT } from '../../../../core/config/app-environment';
import { organizationPath } from '../../../../core/context/scope-context';
import { NwDatePipe } from '../../../../shared/format/format.pipes';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { NwToastService } from '../../../../shared/ui/toast/toast.service';
import { isolated } from '../../../platforms/domain/create-platform.model';
import {
  type CreateAdminInvitationAction,
  CreateInvitationInput,
  invitationFailureKey,
} from '../../application/admin-invitation.actions';
import {
  CONTACT_MAX,
  DEFAULT_EXPIRY,
  EXPIRY_PRESETS,
  ExpiryPreset,
  INVITATION_TYPE_MAX,
  invitationRequestOf,
  invitationTypeProblem,
  normaliseContact,
} from '../../domain/admin-invitation.model';

/** Catalog keys, listed in full (never built at runtime). */
const EXPIRY_KEYS = {
  60: 'organizations.invitations.expiry.hour',
  1440: 'organizations.invitations.expiry.day',
  4320: 'organizations.invitations.expiry.threeDays',
  10080: 'organizations.invitations.expiry.week',
} as const satisfies Record<ExpiryPreset, string>;

const TYPE_PROBLEM_KEYS = {
  required: 'organizations.invitations.form.typeRequired',
  reserved: 'organizations.invitations.form.typeReserved',
  invalid: 'organizations.invitations.form.typeInvalid',
} as const;

const CONTACT_PROBLEM_KEYS = {
  invalidPhone: 'organizations.invitations.form.contactInvalidPhone',
  tooLong: 'organizations.invitations.form.contactTooLong',
  required: 'organizations.invitations.form.contactRequired',
} as const;

type Binding = 'anyone' | 'person';
type CopyState = 'idle' | 'copied' | 'failed';

/**
 * The "Create admin invitation" dialog (P3b-S3 design, artboards 2, 3, 5): the type, the duration and the optional
 * contact binding; the owner's simulated verification for `admin_invitation.create`; pending; then the ONE-TIME CODE.
 *
 * The code exists only in the run's result while this dialog is open. It is shown in a read-only field (never in a live
 * region), copied on request (with a manual fallback), and closing before copying asks first (`nw-dialog` guarded).
 * When the dialog goes (closed, or the person navigates away) the run is reset and the code is gone: it is never
 * stored, logged, toasted or shown again.
 */
@Component({
  selector: 'adm-create-admin-invitation-dialog',
  imports: [
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDatePipe,
    NwDialog,
    NwFormField,
    NwIcon,
    NwInlineAlert,
    NwSpinner,
  ],
  templateUrl: './create-admin-invitation-dialog.html',
  styleUrl: './create-admin-invitation-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateAdminInvitationDialog {
  protected readonly action = inject<CreateAdminInvitationAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);
  private readonly toasts = inject(NwToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly state = this.action.run.state;
  protected readonly target = this.action.currentTarget()!;
  protected readonly presets = EXPIRY_PRESETS;
  protected readonly expiryKeys = EXPIRY_KEYS;
  protected readonly typeMax = INVITATION_TYPE_MAX;
  protected readonly contactMax = CONTACT_MAX;

  protected readonly invitationType = signal('');
  protected readonly expiry = signal<ExpiryPreset>(DEFAULT_EXPIRY);
  protected readonly binding = signal<Binding>('anyone');
  protected readonly contact = signal('');
  protected readonly code = signal('');
  private readonly submitted = signal(false);
  /** The last request sent: "Try again" after a refusal that applied nothing sends it again (verified again). */
  private lastInput: CreateInvitationInput | null = null;

  protected readonly copy = signal<CopyState>('idle');
  /** "Close without copying the code?" is shown in place of the code. */
  protected readonly confirmingClose = signal(false);
  protected readonly demoCode = signal<string | null>(null);

  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly invitationCode = viewChild<ElementRef<HTMLInputElement>>('invitationCode');
  private readonly mainButton = viewChild('mainButton', { read: ElementRef<HTMLButtonElement> });
  private readonly backToCode = viewChild('backToCode', { read: ElementRef<HTMLButtonElement> });
  private readonly form = viewChild<ElementRef<HTMLFormElement>>('form');

  protected readonly isolatedOrganization = isolated(this.target.organizationName);

  /** The one-time code, only while this dialog shows the successful result. */
  protected readonly created = computed(() => {
    const state = this.state();
    return state.phase === 'succeeded' ? state.result : null;
  });

  protected readonly typeError = computed(() => {
    if (!this.submitted()) return null;
    const problem = invitationTypeProblem(this.invitationType());
    return problem ? TYPE_PROBLEM_KEYS[problem] : null;
  });

  protected readonly contactError = computed(() => {
    if (!this.submitted() || this.binding() !== 'person') return null;
    const result = normaliseContact(this.contact());
    if ('problem' in result) return CONTACT_PROBLEM_KEYS[result.problem];
    return result.value === null ? CONTACT_PROBLEM_KEYS.required : null;
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    if (state.phase === 'failed') return state.failure;
    if (state.phase === 'verifying') return state.failure;
    return null;
  });
  protected readonly failureKey = computed(() => {
    const failure = this.failure();
    return failure ? invitationFailureKey(failure, 'create') : null;
  });

  /** Try again only where nothing was applied: a collision (`409`) or an outage (`503`). Never after a lost answer. */
  protected readonly canRetry = computed(() => {
    const state = this.state();
    return (
      state.phase === 'failed' &&
      (state.failure.kind === 'conflict' || state.failure.kind === 'unavailable')
    );
  });

  protected readonly busy = computed(() => {
    const state = this.state();
    return state.phase === 'pending' || (state.phase === 'verifying' && state.busy);
  });

  /** Closing asks first while the code is shown and not copied. */
  protected readonly guarded = computed(() => this.created() !== null && this.copy() !== 'copied');

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then((bindings) => this.demoCode.set(bindings.signIn.code));

    // Any navigation away from this Organization closes the dialog (a request under way keeps running, detached).
    const here = organizationPath(this.target.platformId, this.target.organizationId);
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((event) => {
        if (event.urlAfterRedirects.split(/[?#]/)[0] !== here) this.ref.close();
      });

    // A code shown but never copied is lost when the dialog goes: say so, without the code.
    inject(DestroyRef).onDestroy(() => {
      if (this.created() !== null && this.copy() !== 'copied' && !this.acknowledged)
        this.toasts.show(this.transloco.translate('organizations.invitations.code.lostUncopied'), {
          tone: 'warning',
          duration: null,
        });
    });

    let previous = '';
    effect(() => {
      const state = this.state();
      if (state.phase === 'closed') {
        this.ref.close();
        return;
      }
      const step =
        state.phase === 'verifying'
          ? `verifying:${state.busy}:${state.failure?.kind ?? ''}`
          : `${state.phase}:${this.confirmingClose()}`;
      if (step === previous) return;
      previous = step;
      afterNextRender(() => this.focusFor(), { injector: this.injector });
    });
  }

  /** The person closed knowingly ("Close anyway"), so no warning toast follows. */
  private acknowledged = false;

  protected onType(event: Event): void {
    this.invitationType.set((event.target as HTMLInputElement).value);
  }

  protected onContact(event: Event): void {
    this.contact.set((event.target as HTMLInputElement).value);
  }

  protected onBinding(value: Binding): void {
    this.binding.set(value);
  }

  protected onExpiry(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    const preset = EXPIRY_PRESETS.find((p) => p === value);
    if (preset !== undefined) this.expiry.set(preset);
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    if (this.typeError() !== null) return this.focusField('invitation-type');
    let contact: string | null = null;
    if (this.binding() === 'person') {
      if (this.contactError() !== null) return this.focusField('invitee-contact');
      const result = normaliseContact(this.contact());
      contact = 'value' in result ? result.value : null;
    }
    this.code.set('');
    this.lastInput = {
      target: this.target,
      request: invitationRequestOf(this.invitationType(), this.expiry(), contact),
    };
    this.action.run.submit(this.lastInput);
  }

  protected verify(event: Event): void {
    event.preventDefault();
    this.action.run.verify({ method: 'totp', code: this.code() });
  }

  protected back(): void {
    this.action.run.back();
  }

  protected tryAgain(): void {
    if (this.lastInput === null) return;
    this.code.set('');
    this.action.run.submit(this.lastInput);
  }

  /** "Check invitations" after a lost answer: the list is reloaded behind the dialog, which closes. */
  protected checkInvitations(): void {
    this.ref.close();
  }

  protected async copyCode(): Promise<void> {
    const created = this.created();
    if (created === null) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard');
      await navigator.clipboard.writeText(created.code);
      this.copy.set('copied');
    } catch {
      // Manual fallback: the code is selected so the person can copy it themselves.
      this.copy.set('failed');
      this.selectCode();
    }
  }

  protected selectCode(): void {
    const input = this.invitationCode()?.nativeElement;
    input?.focus();
    input?.select();
  }

  /** Done, Escape, the backdrop or the close button while the code is shown. */
  protected requestClose(): void {
    if (this.busy()) return;
    if (this.confirmingClose()) {
      this.confirmingClose.set(false);
      return;
    }
    if (this.created() !== null && this.copy() !== 'copied') this.confirmingClose.set(true);
    else this.ref.close();
  }

  protected closeAnyway(): void {
    this.acknowledged = true;
    this.ref.close();
  }

  protected cancel(): void {
    if (this.busy()) return;
    this.ref.close();
  }

  private focusField(name: string): void {
    afterNextRender(
      () => this.form()?.nativeElement.querySelector<HTMLElement>(`[name="${name}"]`)?.focus(),
      { injector: this.injector },
    );
  }

  private focusFor(): void {
    const phase = this.state().phase;
    if (this.confirmingClose()) this.backToCode()?.nativeElement.focus();
    else if (phase === 'succeeded') this.selectCode();
    else if (phase === 'editing') this.focusField('invitation-type');
    else if (phase === 'verifying' && !this.busy()) this.codeInput()?.nativeElement.focus();
    else if (phase === 'failed') this.mainButton()?.nativeElement.focus();
  }
}
