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
import { isolated } from '../../../platforms/domain/create-platform.model';
import type { CreateOrganizationAction } from '../../application/create-organization.action';
import {
  ORGANIZATION_FIELD_LIMITS,
  OPTIONAL_ORGANIZATION_FIELDS,
  OptionalOrganizationField,
  OrganizationDraft,
  OrganizationField,
  draftProblems,
  requestFrom,
} from '../../domain/create-organization.model';

/** Catalog keys, listed in full (never built at runtime). */
const LABEL_KEYS = {
  name: 'organizations.create.nameLabel',
  taxCode: 'organizations.create.taxCodeLabel',
  address: 'organizations.create.addressLabel',
  phone: 'organizations.create.phoneLabel',
  type: 'organizations.create.typeLabel',
} as const satisfies Record<OrganizationField, string>;

const HINT_KEYS = {
  name: 'organizations.create.nameHint',
  taxCode: 'organizations.create.optionalHint',
  address: 'organizations.create.optionalHint',
  phone: 'organizations.create.optionalHint',
  type: 'organizations.create.typeHint',
} as const satisfies Record<OrganizationField, string>;

const PROBLEM_KEYS = {
  required: 'organizations.create.nameRequired',
  tooLong: 'organizations.create.tooLong',
} as const;

/** How each optional field is typed: a phone number and a tax code are written left to right in every language. */
const OPTIONAL_INPUTS = {
  taxCode: { type: 'text', autocomplete: 'off', dir: 'ltr' },
  address: { type: 'text', autocomplete: 'street-address', dir: 'auto' },
  phone: { type: 'tel', autocomplete: 'tel', dir: 'ltr' },
  type: { type: 'text', autocomplete: 'off', dir: 'auto' },
} as const satisfies Record<OptionalOrganizationField, object>;

const EMPTY: OrganizationDraft = { name: '', taxCode: '', address: '', phone: '', type: '' };

/**
 * The "Create organization" dialog (P3b design): the parent Platform (from the URL, never typed), the name and, under
 * "More details", Core's four optional fields; then the owner's simulated verification for `organization.create`,
 * then pending and the result. Driven by the action's `ActionRun`; it owns only the typed values, the disclosure and
 * focus. While the command runs it cannot be dismissed (`nw-dialog` busy); leaving the page closes it without
 * cancelling the command, whose result is then a toast.
 */
@Component({
  selector: 'adm-create-organization-dialog',
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
  templateUrl: './create-organization-dialog.html',
  styleUrl: './create-organization-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateOrganizationDialog {
  protected readonly action = inject<CreateOrganizationAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.action.run.state;
  protected readonly limits = ORGANIZATION_FIELD_LIMITS;
  protected readonly optionalFields = OPTIONAL_ORGANIZATION_FIELDS;
  protected readonly optionalInputs = OPTIONAL_INPUTS;
  protected readonly labelKeys = LABEL_KEYS;
  protected readonly hintKeys = HINT_KEYS;
  /** The Platform the dialog was opened on; it does not follow later URL changes (the request is for this one). */
  protected readonly platform = this.action.platform();

  protected readonly draft = signal<OrganizationDraft>(EMPTY);
  protected readonly code = signal('');
  protected readonly moreDetails = signal(false);
  /** The client-side checks, shown once the person tried to submit. */
  private readonly submitted = signal(false);
  /** The demo verification code (demo builds only, from the demo bindings; never in a production bundle). */
  protected readonly demoCode = signal<string | null>(null);

  private readonly form = viewChild<ElementRef<HTMLFormElement>>('form');
  private readonly codeInput = viewChild<ElementRef<HTMLInputElement>>('codeInput');
  private readonly mainButton = viewChild<ElementRef<HTMLButtonElement>>('mainButton');

  protected readonly isolatedName = computed(() => isolated(this.draft().name.trim()));
  protected readonly isolatedPlatform = isolated(this.platform?.name ?? '');

  protected readonly errors = computed(() => {
    if (!this.submitted()) return {};
    const problems = draftProblems(this.draft());
    const errors: Partial<Record<OrganizationField, string>> = {};
    for (const field of Object.keys(problems) as OrganizationField[]) {
      const problem = problems[field];
      if (problem) errors[field] = PROBLEM_KEYS[problem];
    }
    return errors;
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

  /** A refusal of the request itself (not of a field): shown as an alert with Close, and Try again when it helps. */
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

  protected onField(field: OrganizationField, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  protected onCode(event: Event): void {
    this.code.set((event.target as HTMLInputElement).value);
  }

  protected toggleMoreDetails(): void {
    this.moreDetails.update((open) => !open);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    this.submitted.set(true);
    const problems = draftProblems(this.draft());
    const first = (Object.keys(LABEL_KEYS) as OrganizationField[]).find((f) => problems[f]);
    if (first !== undefined) {
      if (first !== 'name') this.moreDetails.set(true);
      afterNextRender(() => this.fieldInput(first)?.focus(), { injector: this.injector });
      return;
    }
    if (this.platform === null) return;
    this.code.set('');
    this.action.run.submit(requestFrom(this.platform.id, this.draft()));
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

  private fieldInput(field: OrganizationField): HTMLInputElement | null {
    return (
      this.form()?.nativeElement.querySelector<HTMLInputElement>(
        `input[name="organization-${field}"]`,
      ) ?? null
    );
  }

  private focusFor(phase: string): void {
    if (phase === 'editing') this.fieldInput('name')?.focus();
    else if (phase === 'verifying' && !this.busy()) this.codeInput()?.nativeElement.focus();
    else if (phase === 'failed') this.mainButton()?.nativeElement.focus();
  }
}
