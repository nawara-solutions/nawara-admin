import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DemoSignInHint } from '../../../../core/config/app-environment';

/**
 * Demo builds only: the fictional accounts a reviewer can sign in with, and what is simulated (the passkey prompt).
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
}
