import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { can } from '../../../../core/access/capability-policy';
import { homePath } from '../../../../core/access/home-path';
import { AuthSession } from '../../../../core/auth/auth-session';
import { organizationsPath } from '../../../../core/context/scope-context';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwDataState } from '../../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { OrganizationDetailView } from '../../application/organization-detail.facade';

/**
 * The Organization's own states for a page nested under it (its members, one membership): checking, outage, not
 * accessible (one state for unknown and not yours), not found, loading, not in build, error. Each with its own
 * heading, as the Organization detail page shows them.
 */
@Component({
  selector: 'adm-organization-states',
  imports: [RouterLink, TranslocoPipe, NwButton, NwDataState, NwIcon],
  template: `
    @let state = view();
    @switch (state.status) {
      @case ('checking') {
        <h1 class="nw-visually-hidden">{{ 'organizations.states.checking' | transloco }}</h1>
        <nw-data-state state="loading" [title]="'organizations.states.checking' | transloco" />
      }
      @case ('directoryUnavailable') {
        <h1 class="nw-visually-hidden">{{ 'organizations.states.directoryTitle' | transloco }}</h1>
        <nw-data-state
          state="error"
          [title]="'organizations.states.directoryTitle' | transloco"
          [description]="'organizations.states.directoryDescription' | transloco"
        >
          <div nwDataStateActions>
            <button nw-button variant="secondary" type="button" (click)="retry.emit()">
              <nw-icon name="refresh-cw" size="sm" />{{ 'organizations.states.retry' | transloco }}
            </button>
          </div>
        </nw-data-state>
      }
      @case ('notAccessible') {
        <h1 class="nw-visually-hidden">
          {{ 'organizations.states.notAccessibleTitle' | transloco }}
        </h1>
        <nw-data-state
          state="empty"
          [title]="'organizations.states.notAccessibleTitle' | transloco"
          [description]="'organizations.states.notAccessibleDescription' | transloco"
        >
          <div nwDataStateActions>
            @if (canOpenPlatforms()) {
              <a nw-button variant="secondary" routerLink="/platforms">
                <nw-icon name="arrow-left" size="sm" />{{
                  'platformDashboard.header.backToPlatforms' | transloco
                }}
              </a>
            } @else {
              <a nw-button variant="secondary" [routerLink]="home()">
                <nw-icon name="arrow-left" size="sm" />{{ 'shell.context.assigned' | transloco }}
              </a>
            }
          </div>
        </nw-data-state>
      }
      @case ('notFound') {
        <h1 class="nw-visually-hidden">{{ 'organizations.states.notFoundTitle' | transloco }}</h1>
        <nw-data-state
          state="empty"
          [title]="'organizations.states.notFoundTitle' | transloco"
          [description]="'organizations.states.notFoundDescription' | transloco"
        >
          <div nwDataStateActions>
            <a nw-button variant="secondary" [routerLink]="organizationsPath(state.platform.id)">
              <nw-icon name="arrow-left" size="sm" />{{
                'organizations.header.backToDirectory' | transloco
              }}
            </a>
          </div>
        </nw-data-state>
      }
      @case ('notInBuild') {
        <h1 class="nw-visually-hidden">{{ 'organizations.states.notInBuildTitle' | transloco }}</h1>
        <nw-data-state
          state="empty"
          [title]="'organizations.states.notInBuildTitle' | transloco"
          [description]="'organizations.states.notInBuildDescription' | transloco"
        />
      }
      @case ('error') {
        <h1 class="nw-visually-hidden">
          {{ 'organizations.states.errorOrganizationTitle' | transloco }}
        </h1>
        <nw-data-state
          state="error"
          [title]="'organizations.states.errorOrganizationTitle' | transloco"
          [description]="'organizations.states.errorDescription' | transloco"
        >
          <div nwDataStateActions>
            <button nw-button variant="secondary" type="button" (click)="retry.emit()">
              <nw-icon name="refresh-cw" size="sm" />{{ 'organizations.states.retry' | transloco }}
            </button>
          </div>
        </nw-data-state>
      }
      @default {
        <h1 class="nw-visually-hidden">
          {{ 'organizations.states.loadingOrganization' | transloco }}
        </h1>
        <nw-data-state
          state="loading"
          [title]="'organizations.states.loadingOrganization' | transloco"
        />
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationStates {
  private readonly session = inject(AuthSession);
  readonly view = input.required<Exclude<OrganizationDetailView, { readonly status: 'ready' }>>();
  readonly retry = output<void>();
  protected readonly organizationsPath = organizationsPath;
  protected readonly home = computed(() => homePath(this.session.actor()));
  protected readonly canOpenPlatforms = computed(() =>
    can(this.session.actor(), 'company.platforms.view'),
  );
}
