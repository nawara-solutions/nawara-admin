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
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { retryOf } from '../../../../core/actions/action-failure';
import { APP_ENVIRONMENT } from '../../../../core/config/app-environment';
import { platformPath } from '../../../../core/context/scope-context';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDialog } from '../../../../shared/ui/dialog/dialog';
import { NwControl, NwFormField } from '../../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSpinner } from '../../../../shared/ui/spinner/spinner';
import {
  type EditPlatformAction,
  editPlatformFailureKey,
} from '../../application/edit-platform.action';
import {
  PLATFORM_NAME_MAX,
  isolated,
  platformNameProblem,
} from '../../domain/create-platform.model';
import { platformPatchFrom } from '../../domain/edit-platform.model';

const PROBLEM_KEYS = {
  required: 'platforms.edit.nameRequired',
  tooLong: 'platforms.edit.nameTooLong',
} as const;

/** The dialog's own view: the form, or the in-dialog "Discard your changes?". */
type View = 'form' | 'discard';

/**
 * The "Edit platform name" dialog (M4), the edit-organization dialog's pattern with its one field: the name, prefilled;
 * Save only when the trimmed name really changes; the key, product and Company are never sent. With a change, Escape,
 * the backdrop, the close button and Cancel ask first (`nw-dialog` guarded). Driven by the action's `ActionRun` (no
 * step-up); it owns the draft, the view and focus.
 *
 * A save under way is never cancelled: it detaches and reports by toast. Any navigation away from this Platform's
 * settings closes the dialog. After a lost answer, "Check current name" re-reads it; nothing is resent automatically.
 */
@Component({
  selector: 'adm-edit-platform-dialog',
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
  templateUrl: './edit-platform-dialog.html',
  styleUrl: './edit-platform-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class EditPlatformDialog {
  protected readonly action = inject<EditPlatformAction>(DIALOG_DATA);
  private readonly ref = inject(DialogRef);
  private readonly injector = inject(Injector);

  protected readonly state = this.action.run.state;
  protected readonly max = PLATFORM_NAME_MAX;

  /** The name compared against: as loaded when opened, or as re-read after a lost answer. */
  protected readonly original = computed(() => this.action.target()!.original);
  protected readonly draft = signal(this.original());
  protected readonly view = signal<View>('form');
  /** After a lost answer: whether the current name was re-read (the form is shown again), or is loading. */
  protected readonly recovered = signal(false);
  protected readonly reloading = signal(false);
  protected readonly reloadFailed = signal(false);
  /** The client-side check, shown once the person tried to save. */
  private readonly submitted = signal(false);
  protected readonly demo = signal(false);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  // Read as elements: on an `nw-button` the template reference is the component.
  private readonly mainButton = viewChild('mainButton', { read: ElementRef<HTMLButtonElement> });
  private readonly keepEditing = viewChild('keepEditing', { read: ElementRef<HTMLButtonElement> });

  protected readonly isolatedName = computed(() => isolated(this.original()));
  protected readonly patch = computed(() => platformPatchFrom(this.original(), this.draft()));
  protected readonly dirty = computed(() => this.patch() !== null);

  protected readonly error = computed(() => {
    if (!this.submitted()) return null;
    const problem = platformNameProblem(this.draft());
    return problem ? PROBLEM_KEYS[problem] : null;
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    return state.phase === 'failed' ? state.failure : null;
  });

  protected readonly failureKey = computed(() => {
    const failure = this.failure();
    return failure ? editPlatformFailureKey(failure) : null;
  });

  /** Whether the form is shown: editing, a refused request (validation), or after re-reading from a lost answer. */
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
  /** Closing asks first while there is an unsaved change (and never while saving). */
  protected readonly guarded = computed(() => this.dirty() && !this.busy());

  constructor() {
    void inject(APP_ENVIRONMENT)
      .demo?.load()
      .then(() => this.demo.set(true));

    // Any navigation away from this Platform's settings closes the dialog (a save under way keeps running, detached).
    const here = `${platformPath(this.action.target()!.platformId)}/settings`;
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

  protected onName(event: Event): void {
    this.draft.set((event.target as HTMLInputElement).value);
  }

  protected save(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    const patch = this.patch();
    if (patch === null) return;
    this.submitted.set(true);
    if (platformNameProblem(this.draft()) !== null) {
      afterNextRender(() => this.nameInput()?.nativeElement.focus(), { injector: this.injector });
      return;
    }
    const target = this.action.target();
    if (target === null) return;
    this.action.run.submit({ platformId: target.platformId, patch });
  }

  /** Cancel, Escape, the backdrop or the close button: closes at once without a change, otherwise asks first. */
  protected requestClose(): void {
    if (this.busy()) return;
    if (this.view() === 'discard') this.view.set('form');
    else if (this.dirty() && this.showsForm()) this.view.set('discard');
    else this.ref.close();
  }

  protected discard(): void {
    this.ref.close();
  }

  protected keepEditingChange(): void {
    this.view.set('form');
  }

  protected tryAgain(): void {
    this.action.run.retry();
  }

  /**
   * After a lost answer: re-reads the Platform's current name. A typed name that already matches it means the change was
   * saved; otherwise the person's name stays, compared with the current one. Nothing is sent.
   */
  protected checkCurrent(): void {
    if (this.reloading()) return;
    this.reloading.set(true);
    this.reloadFailed.set(false);
    this.action.reloadCurrent().subscribe({
      next: () => {
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

  private focusFor(): void {
    if (this.view() === 'discard') this.keepEditing()?.nativeElement.focus();
    else if (this.showsForm()) this.nameInput()?.nativeElement.focus();
    else if (this.state().phase === 'failed') this.mainButton()?.nativeElement.focus();
  }
}
