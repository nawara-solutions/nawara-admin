import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { OperatorGrantsRefresh } from '../../core/auth/operator-grants-refresh';
import { ScopeContext } from '../../core/context/scope-context';
import { NwButton } from '../../shared/ui/button/button';
import { NwIcon } from '../../shared/ui/icon/icon';
import { NwSpinner } from '../../shared/ui/spinner/spinner';

/**
 * What a platform-scope page that refused an operator says about their Platform list (P6-S2b), above its "not
 * accessible" state: after the refresh that refusal asked for, "Your access may have changed. Your Platform list has
 * been refreshed."; if that refresh failed, that the list could not be refreshed, with "Try again" (a new grants read,
 * nothing else). Neutral: never which Platform changed, by whom or when. Only for the Platform whose page asked; nothing
 * for an owner or where the shell provides no refresh.
 */
@Component({
  selector: 'adm-grants-refresh-notice',
  imports: [TranslocoPipe, NwButton, NwIcon, NwSpinner],
  template: `
    @if (notice(); as n) {
      @if (n.kind === 'refreshed') {
        <p class="grants-refresh-notice" role="status" data-grants-notice="refreshed">
          <nw-icon name="refresh-cw" size="sm" />
          <span>{{ 'shell.grantsRefresh.refreshed' | transloco }}</span>
        </p>
      } @else {
        <p
          class="grants-refresh-notice grants-refresh-notice--warning"
          role="status"
          data-grants-notice="unavailable"
        >
          <nw-icon name="circle-alert" size="sm" />
          <span>{{ 'shell.grantsRefresh.unavailable' | transloco }}</span>
          <button
            nw-button
            variant="ghost"
            size="sm"
            type="button"
            data-grants-retry
            [attr.aria-disabled]="busy() || null"
            (click)="retry()"
          >
            @if (busy()) {
              <nw-spinner />
            }
            {{ 'shell.grantsRefresh.retry' | transloco }}
          </button>
        </p>
      }
    }
  `,
  styleUrl: './grants-refresh-notice.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'grants-refresh-notice-host' },
})
export class GrantsRefreshNotice {
  private readonly refresh = inject(OperatorGrantsRefresh, { optional: true });
  private readonly scope = inject(ScopeContext);

  private readonly platformId = computed(() => {
    const scope = this.scope.scope();
    return scope.kind === 'platform' ? scope.platformId : null;
  });

  protected readonly notice = computed(() => {
    const notice = this.refresh?.notice() ?? null;
    return notice !== null && notice.platformId === this.platformId() ? notice : null;
  });

  protected readonly busy = computed(() => this.refresh?.busy() ?? false);

  protected retry(): void {
    if (this.busy()) return;
    this.refresh?.refresh('retry', this.platformId());
  }
}
