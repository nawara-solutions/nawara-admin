import { DIALOG_DATA } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlatformId } from '../../../core/context/scope.model';
import { platformPath } from '../../../core/context/scope-context';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDialog } from '../../../shared/ui/dialog/dialog';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { OperatorDetailFacade } from '../application/operator-detail.facade';
import { PlatformAccessAction } from '../application/platform-access.action';
import { OperatorSummary } from '../domain/operator.model';

@Component({
  selector: 'adm-operator-detail-panel',
  imports: [NwDialog, TranslocoPipe, RouterLink, NwDatePipe, NwButton, NwIcon],
  template: `
    <nw-dialog size="side" [title]="contact" [closeLabel]="'common.close' | transloco">
      @let view = facade.view();
      @if (view.status === 'ready') {
        @let operator = view.operator;
        @let history = facade.historyView();
        <section class="card" aria-labelledby="operator-panel-access">
          <h3 id="operator-panel-access">
            {{
              (operator.accountState === 'blocked'
                ? 'operators.account.keptTitle'
                : 'operators.detail.current.title'
              ) | transloco
            }}
          </h3>
          @switch (history.status) {
            @case ('ready') {
              @if (history.current.length) {
                @if (operator.accountState === 'blocked') {
                  <p class="note">{{ 'operators.account.keptHint' | transloco }}</p>
                }
                <ul class="platforms" role="list">
                  @for (assignment of history.current; track assignment.id) {
                    <li>
                      <span class="platform-icon"><nw-icon name="hexagon" size="sm" /></span>
                      <span class="platform-name"
                        ><a [routerLink]="platformPath(assignment.platformId)"
                          ><bdi>{{
                            facade.platformName(assignment.platformId) ??
                              ('operators.list.unknownPlatform' | transloco)
                          }}</bdi></a
                        ><small>{{
                          'operators.detail.given'
                            | transloco: { date: (assignment.assignedAt | nwDate: 'date') }
                        }}</small></span
                      >
                      @if (access.offered()) {
                        <button
                          nw-button
                          variant="ghost"
                          type="button"
                          class="remove"
                          [attr.aria-label]="
                            'operators.access.removeFor'
                              | transloco
                                : {
                                    name:
                                      facade.platformName(assignment.platformId) ??
                                      ('operators.list.unknownPlatform' | transloco),
                                  }
                          "
                          [attr.aria-disabled]="access.busy() || null"
                          (click)="removeAccess(operator, assignment.platformId)"
                        >
                          {{ 'operators.access.remove' | transloco }}
                        </button>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p class="empty">
                  {{
                    (operator.accountState === 'blocked'
                      ? 'operators.detail.current.noneBlocked'
                      : 'operators.detail.current.none'
                    ) | transloco
                  }}
                </p>
              }
              @if (history.removed.length) {
                <details class="history">
                  <summary>
                    {{ 'operators.detail.removed.title' | transloco }} ({{
                      history.removed.length
                    }})
                  </summary>
                  <ul class="history__list" role="list">
                    @for (assignment of history.removed; track assignment.id) {
                      <li>
                        <span>{{
                          facade.platformName(assignment.platformId) ??
                            ('operators.list.unknownPlatform' | transloco)
                        }}</span
                        ><span>{{
                          'operators.detail.removedOn'
                            | transloco: { date: (assignment.revokedAt! | nwDate: 'date') }
                        }}</span>
                      </li>
                    }
                  </ul>
                </details>
              }
            }
            @case ('loading') {
              <p class="note" role="status">{{ 'operators.detail.history.loading' | transloco }}</p>
            }
            @case ('notInBuild') {
              <p class="note">{{ 'operators.detail.history.notInBuild' | transloco }}</p>
            }
            @default {
              <p class="note" role="alert">{{ 'operators.detail.history.error' | transloco }}</p>
              <button nw-button variant="ghost" type="button" (click)="facade.reload()">
                {{ 'operators.states.retry' | transloco }}
              </button>
            }
          }
        </section>
        <p class="notice">
          <nw-icon name="info" size="sm" /><span>{{
            'operators.detail.account.provisional' | transloco
          }}</span>
        </p>
      } @else if (view.status === 'loading') {
        <p class="note" role="status">{{ 'operators.states.loading' | transloco }}</p>
      } @else {
        <p class="note" role="alert">{{ 'operators.states.errorDescription' | transloco }}</p>
        <button nw-button variant="secondary" type="button" (click)="facade.reload()">
          {{ 'operators.states.retry' | transloco }}
        </button>
      }
    </nw-dialog>
  `,
  styles: `
    .platform-icon {
      display: grid;
      place-items: center;
      flex: none;
      border-radius: var(--nw-radius-md);
      background: var(--nw-surface-brand-subtle);
      color: var(--nw-text-brand);
    }
    .card {
      padding: 0 0 var(--nw-space-5);
      margin-block-end: var(--nw-space-3);
    }
    h3 {
      margin: 0 0 var(--nw-space-4);
      color: var(--nw-text-primary);
      font-size: var(--nw-text-size-md);
      font-weight: var(--nw-font-weight-semibold);
    }
    .note {
      margin: 0 0 var(--nw-space-4);
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-sm);
      line-height: 1.6;
    }
    .notice {
      display: flex;
      align-items: flex-start;
      gap: var(--nw-space-2);
      padding: 0;
      margin: var(--nw-space-5) 0 0;
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-xs);
      line-height: 1.5;
    }
    .notice nw-icon {
      flex: none;
    }
    .empty {
      padding: var(--nw-space-3) 0;
      margin: 0;
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-sm);
    }
    .platforms,
    .history__list {
      display: grid;
      gap: var(--nw-space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .platforms li {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--nw-space-3);
      padding: var(--nw-space-3) 0;
      border-block-end: 1px solid var(--nw-border-subtle);
    }
    .platform-icon {
      inline-size: 2.75rem;
      block-size: 2.75rem;
    }
    .platform-name {
      display: grid;
      flex: 1 1 8rem;
      gap: var(--nw-space-1);
      min-inline-size: 0;
      font-size: var(--nw-text-size-sm);
      font-weight: var(--nw-font-weight-semibold);
    }
    .platform-name a {
      color: var(--nw-text-primary);
      overflow-wrap: anywhere;
    }
    .platform-name small {
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-xs);
      font-weight: var(--nw-font-weight-regular);
    }
    .remove {
      --nw-button-fg: var(--nw-status-danger-fg);
    }
    .history {
      padding-block-start: var(--nw-space-4);
      margin-block-start: var(--nw-space-4);
      border-block-start: 1px solid var(--nw-border-subtle);
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-sm);
    }
    .history summary {
      cursor: pointer;
      font-weight: var(--nw-font-weight-medium);
    }
    .history summary:focus-visible {
      outline: 2px solid var(--nw-focus-ring);
      outline-offset: 4px;
    }
    .history__list {
      margin-block-start: var(--nw-space-3);
    }
    .history__list li {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--nw-space-2);
      padding: var(--nw-space-3);
      border-radius: var(--nw-radius-md);
      background: var(--nw-surface-sunken);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OperatorDetailPanel {
  protected readonly contact = inject<{ contact: string }>(DIALOG_DATA).contact;
  protected readonly facade = inject(OperatorDetailFacade);
  protected readonly access = inject(PlatformAccessAction);
  protected readonly platformPath = platformPath;

  protected removeAccess(operator: OperatorSummary, platformId: PlatformId): void {
    const platform = this.facade.companyPlatforms().find((item) => item.id === platformId);
    if (platform)
      this.access.open({
        operatorId: operator.id,
        contact: operator.contact,
        platform,
        grant: false,
      });
  }
}
