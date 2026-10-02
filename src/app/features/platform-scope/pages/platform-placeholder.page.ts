import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { canEnterPlatform, can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { ScopeContext } from '../../../core/context/scope-context';
import { PlatformRef } from '../../../core/context/scope.model';
import { ViewState } from '../../../core/state/view-state';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';

/**
 * Platform scope entry (`/platforms/:platformId`): a deliberately minimal placeholder that confirms the platform scope.
 * Platform administration pages are later stages. An unknown Platform and one outside the actor's scope show the same
 * "not found or not accessible" state, as Core collapses both into `404`.
 */
@Component({
  selector: 'adm-platform-placeholder-page',
  imports: [RouterLink, TranslocoPipe, NwButton, NwDataState, NwIcon],
  templateUrl: './platform-placeholder.page.html',
  styleUrl: './platform-placeholder.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platform-placeholder' },
})
export class PlatformPlaceholderPage {
  private readonly session = inject(AuthSession);
  private readonly context = inject(ScopeContext);

  protected readonly canOpenCompany = computed(() =>
    can(this.session.actor(), 'company.platforms.view'),
  );

  protected readonly platform = computed<ViewState<PlatformRef>>(() => {
    const scope = this.context.scope();
    const directory = this.context.directory();
    if (scope.kind !== 'platform') return { status: 'empty' };
    if (directory.status !== 'success') {
      return directory.status === 'idle' || directory.status === 'loading'
        ? { status: 'loading' }
        : { status: 'empty' };
    }
    const known = directory.data.platforms;
    const platform = known.find((p) => p.id === scope.platformId);
    const allowed = canEnterPlatform(
      this.session.actor(),
      scope.platformId,
      known.map((p) => p.id),
    );
    return platform && allowed ? { status: 'success', data: platform } : { status: 'empty' };
  });
}
