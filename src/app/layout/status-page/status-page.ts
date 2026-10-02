import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../core/auth/auth-session';
import { NwButton } from '../../shared/ui/button/button';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwIconName } from '../../shared/ui/icon/icon.registry';

/** Route data of a status page. Catalog keys are listed in full in app.routes.ts (i18n check). */
export interface StatusPageData {
  readonly icon: NwIconName;
  readonly titleKey: string;
  readonly descriptionKey: string;
}

/**
 * A whole-page state: sign-in not available in this build, not available to this account, or not found. One `h1`;
 * the way back to the Company overview is offered only when the actor can open it.
 */
@Component({
  selector: 'adm-status-page',
  imports: [RouterLink, TranslocoPipe, NwButton, NwIcon],
  templateUrl: './status-page.html',
  styleUrl: './status-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'status-page' },
})
export class StatusPage {
  private readonly session = inject(AuthSession);
  private readonly data = toSignal(inject(ActivatedRoute).data, { requireSync: true });
  /** Router `Data` is untyped; the routes that use this page declare exactly these fields. */
  protected readonly page = computed<StatusPageData>(() => ({
    icon: this.data()['icon'],
    titleKey: this.data()['titleKey'],
    descriptionKey: this.data()['descriptionKey'],
  }));
  protected readonly canGoBack = computed(() => this.session.actor()?.kind === 'owner');
}
