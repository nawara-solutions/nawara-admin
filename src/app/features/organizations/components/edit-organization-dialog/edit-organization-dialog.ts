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
import { retryOf } from '../../../../core/actions/action-failure';
import { APP_ENVIRONMENT } from '../../../../core/config/app-environment';
import { organizationPath } from '../../../../core/context/scope-context';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import { isolated } from '../../../platforms/domain/create-platform.model';
import {
  type EditOrganizationAction,
  editFailureKey,
} from '../../application/edit-organization.action';
import {
  ORGANIZATION_FIELD_LIMITS,
  OrganizationDraft,
  OrganizationField,
  draftProblems,
} from '../../domain/create-organization.model';
import {
  EDITABLE_FIELDS,
  FieldChange,
  draftOf,
  fieldChange,
  isEmptyPatch,
  patchFrom,
  rebaseDraft,
} from '../../domain/edit-organization.model';

/** Catalog keys, listed in full (never built at runtime). */
const LABEL_KEYS = {
  name: 'organizations.create.nameLabel',
  taxCode: 'organizations.create.taxCodeLabel',
  address: 'organizations.create.addressLabel',
  phone: 'organizations.create.phoneLabel',
  type: 'organizations.create.typeLabel',
} as const satisfies Record<OrganizationField, string>;

const LIMIT_KEYS = {
  name: 'organizations.edit.nameLimit',
  taxCode: 'organizations.edit.optionalLimit',
  address: 'organizations.edit.optionalLimit',
  phone: 'organizations.edit.optionalLimit',
  type: 'organizations.edit.typeLimit',
} as const satisfies Record<OrganizationField, string>;

const PROBLEM_KEYS = {
  required: 'organizations.edit.nameRequired',
  tooLong: 'organizations.create.tooLong',
} as const;

const CHANGE_KEYS = {
  changed: 'organizations.edit.changed',
  removed: 'organizations.edit.willBeRemoved',
} as const satisfies Record<Exclude<FieldChange, 'unchanged'>, string>;

/** How each field is typed: a phone number and a tax code are written left to right in every language. */
const INPUTS = {
  name: { type: 'text', autocomplete: 'organization', dir: 'auto' },
  type: { type: 'text', autocomplete: 'off', dir: 'auto' },
  taxCode: { type: 'text', autocomplete: 'off', dir: 'ltr' },
  phone: { type: 'tel', autocomplete: 'tel', dir: 'ltr' },
  address: { type: 'text', autocomplete: 'street-address', dir: 'auto' },
} as const satisfies Record<OrganizationField, object>;

/** The dialog's own view: the form, the in-dialog "Discard your changes?", or checking the details after a lost answer. */
type View = 'form' | 'discard';

/**
 * The "Edit organization details" dialog (P3b-S2 design, artboards 2–5): the five editable fields, prefilled; a mark
 * and the previous value on every changed field, and Undo on an optional field that saving would remove; Save only
 * when something really changes. With changes, Escape, the backdrop, the close button and Cancel ask first
 * (`nw-dialog` guarded). Driven by the action's `ActionRun` (no step-up); it owns the draft, the view and focus.
 *
 * Browser navigation: Back/Forward closes it as any dialog (CDK), discarding unsaved changes (documented limitation);
 * reloading or closing the tab with changes asks the browser's own confirmation; any navigation away from this
 * Organization closes it. A save under way is never cancelled: it detaches and reports by toast.
 */
@Component({
  selector: 'adm-edit-organization-dialog',
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
  templateUrl: './edit-organization-dialog.html',
  styleUrl: './edit-organization-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class EditOrganizationDialog {
  protected readonly action = inject<EditOrganizationAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);
  private readonly transloco = inject(TranslocoService);

  protected readonly state = this.action.run.state;
  protected readonly fields = EDITABLE_FIELDS;
  protected readonly limits = ORGANIZATION_FIELD_LIMITS;
  protected readonly labelKeys = LABEL_KEYS;
  protected readonly inputs = INPUTS;
  protected readonly changeKeys = CHANGE_KEYS;

  /** The values compared against: as loaded when opened, or as reloaded after a lost answer. */
  protected readonly original = computed(() => this.action.target()!.original);
  protected readonly draft = signal<OrganizationDraft>(draftOf(this.original()));
  protected readonly view = signal<View>('form');
  /** After a lost answer: whether the current details were reloaded (the form is shown again), or are loading. */
  protected readonly recovered = signal(false);
  protected readonly reloading = signal(false);
  protected readonly reloadFailed = signal(false);
  /** The client-side checks, shown once the person tried to save. */
  private readonly submitted = signal(false);
  protected readonly demo = signal(false);

  private readonly form = viewChild<ElementRef<HTMLFormElement>>('form');
  // Read as elements: on an `nw-button` the template reference is the component.
  private readonly mainButton = viewChild('mainButton', { read: ElementRef<HTMLButtonElement> });
  private readonly keepEditing = viewChild('keepEditing', { read: ElementRef<HTMLButtonElement> });

  protected readonly changes = computed(() => {
    const original = this.original();
    const draft = this.draft();
    return Object.fromEntries(
      EDITABLE_FIELDS.map((field) => [field, fieldChange(original, draft, field)]),
    ) as Record<OrganizationField, FieldChange>;
  });
  protected readonly isolatedName = computed(() => isolated(this.original().name));
  protected readonly patch = computed(() => patchFrom(this.original(), this.draft()));
  protected readonly dirty = computed(() => !isEmptyPatch(this.patch()));
  protected readonly changedFields = computed(() =>
    EDITABLE_FIELDS.filter((field) => this.changes()[field] !== 'unchanged'),
  );

  protected readonly errors = computed(() => {
    if (!this.submitted()) return {};
    const problems = draftProblems(this.draft());
    const errors: Partial<Record<OrganizationField, string>> = {};
    for (const field of EDITABLE_FIELDS) {
      const problem = problems[field];
      if (problem) errors[field] = PROBLEM_KEYS[problem];
    }
    return errors;
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    return state.phase === 'failed' ? state.failure : null;
  });

  protected readonly failureKey = computed(() => {
    const failure = this.failure();
    return failure ? editFailureKey(failure) : null;
  });

  /** Whether the form is shown: editing, a refused request (validation), or after reloading from a lost answer. */
  protected readonly showsForm = computed(() => {
    const state = this.state();
    if (state.phase === 'editing') return true;
    if (state.phase !== 'failed') return false;
    return (
      state.failure.kind === 'validation' ||
      (state.failure.kind === 'outcomeUnknown' && this.recovered())
    );
  });

  /** Try again only where nothing was applied and resending is safe (`503`, rate limits). Never after a lost answer. */
  protected readonly canRetry = computed(() => {
    const failure = this.failure();
    return failure !== null && failure.kind !== 'outcomeUnknown' && retryOf(failure) === 'resend';
  });

  protected readonly busy = computed(() => this.state().phase === 'pending');
  /** Closing asks first while there are unsaved changes (and never while saving). */
  protected readonly guarded = computed(() => this.dirty() && !this.busy());

  /** A hint per field: the change, the previous value and the limit, in words (never colour alone). */
  protected readonly hints = computed(() => {
    const original = this.original();
    const changes = this.changes();
    const t = (key: string, params?: Record<string, unknown>) =>
      this.transloco.translate(key, params);
    return Object.fromEntries(
      EDITABLE_FIELDS.map((field) => {
        const limit = t(LIMIT_KEYS[field], { max: ORGANIZATION_FIELD_LIMITS[field] });
        const change = changes[field];
        if (change === 'unchanged') return [field, limit];
        const previous = original[field];
        const was =
          previous === null
            ? t('organizations.edit.wasEmpty')
            : t('organizations.edit.was', { value: isolated(previous) });
        const status = t(CHANGE_KEYS[change]);
        const removes = change === 'removed' ? ` ${t('organizations.edit.removes')}` : '';
        return [field, `${status}. ${was}${removes} ${change === 'removed' ? '' : limit}`.trim()];
      }),
    ) as Record<OrganizationField, string>;
  });

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then(() => this.demo.set(true));

    // Any navigation away from this Organization closes the dialog (a save under way keeps running, detached).
    const target = this.action.target()!;
    const here = organizationPath(target.platformId, target.organizationId);
    inject(Router)
      .events.pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((event) => {
        if (event.urlAfterRedirects.split(/[?#]/)[0] !== here) this.ref.close();
      });

    let previous = '';
    effect(() => {
      const state = this.state();
      if (state.phase === 'succeeded' || state.phase === 'closed') {
        this.ref.close();
        return;
      }
      const step = `${state.phase}:${this.view()}:${this.showsForm()}`;
      if (step === previous) return;
      previous = step;
      afterNextRender(() => this.focusFor(), { injector: this.injector });
    });
  }

  protected onField(field: OrganizationField, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this.draft.update((draft) => ({ ...draft, [field]: value }));
  }

  /** Restores the loaded value of a field that saving would remove, and returns focus to it. */
  protected undo(field: OrganizationField): void {
    const previous = this.original()[field] ?? '';
    this.draft.update((draft) => ({ ...draft, [field]: previous }));
    afterNextRender(() => this.fieldInput(field)?.focus(), { injector: this.injector });
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (!this.dirty() || this.busy()) return;
    this.submitted.set(true);
    const problems = draftProblems(this.draft());
    const first = EDITABLE_FIELDS.find((field) => problems[field]);
    if (first !== undefined) {
      afterNextRender(() => this.fieldInput(first)?.focus(), { injector: this.injector });
      return;
    }
    const target = this.action.target();
    if (target === null) return;
    this.action.run.submit({ organizationId: target.organizationId, patch: this.patch() });
  }

  /** Cancel, Escape, the backdrop or the close button: closes at once without changes, otherwise asks first. */
  protected requestClose(): void {
    if (this.busy()) return;
    if (this.view() === 'discard') this.view.set('form');
    else if (this.dirty() && this.showsForm()) this.view.set('discard');
    else this.ref.close();
  }

  protected discard(): void {
    this.ref.close();
  }

  protected keepEditingChanges(): void {
    this.view.set('form');
  }

  protected tryAgain(): void {
    this.action.run.retry();
  }

  /**
   * After a lost answer: loads the Organization as it is now. Fields the person did not change take the current
   * values; their own changes stay, compared with the current ones (`rebaseDraft`). Nothing is sent.
   */
  protected checkCurrent(): void {
    if (this.reloading()) return;
    this.reloading.set(true);
    this.reloadFailed.set(false);
    const previous = this.original();
    this.action.reloadCurrent().subscribe({
      next: (current) => {
        this.draft.update((draft) => rebaseDraft(previous, current, draft));
        this.reloading.set(false);
        this.recovered.set(true);
      },
      error: () => {
        this.reloading.set(false);
        this.reloadFailed.set(true);
      },
    });
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.guarded()) return;
    event.preventDefault();
    // Legacy browsers show their confirmation only when a return value is set.
    event.returnValue = '';
  }

  private fieldInput(field: OrganizationField): HTMLInputElement | HTMLTextAreaElement | null {
    return (
      this.form()?.nativeElement.querySelector<HTMLInputElement | HTMLTextAreaElement>(
        `[name="organization-${field}"]`,
      ) ?? null
    );
  }

  private focusFor(): void {
    if (this.view() === 'discard') this.keepEditing()?.nativeElement.focus();
    else if (this.showsForm()) this.fieldInput('name')?.focus();
    else if (this.state().phase === 'failed') this.mainButton()?.nativeElement.focus();
  }
}
