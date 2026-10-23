import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DemoSignInHint } from '../../../../core/config/app-environment';
import { LocaleService } from '../../../../core/i18n/locale.service';

/**
 * Demo builds only: the fictional accounts a reviewer can sign in with, and what is simulated (the passkey prompt, the
 * authenticator setup's fictional key).
 * The data comes from the lazily loaded demo bindings, so a production build contains neither this content nor the
 * accounts.
 */
@Component({
  selector: 'aside[adm-auth-demo-note]',
  imports: [TranslocoPipe],
  templateUrl: './auth-demo-note.html',
  styleUrl: './auth-demo-note.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'auth-demo-note' },
})
export class AuthDemoNote {
  readonly hint = input.required<DemoSignInHint>();
  private readonly locale = inject(LocaleService).locale;
  /** The authenticator setup's demo explanation, in the current locale (it comes with the demo bindings). */
  protected readonly enrollmentNote = computed(() => this.hint().enrollmentNote?.[this.locale()]);
}
