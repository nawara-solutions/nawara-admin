import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { PlatformRef } from '../../../core/context/scope.model';
import { ViewState } from '../../../core/state/view-state';
import {
  OrganizationCommercial,
  OrganizationEntitlement,
  OrganizationSubscription,
  OrganizationSubscriptionState,
} from '../domain/organization-commercial.model';
import { NW_CLOCK } from '../../../shared/format/clock';
import { ELIGIBILITY_KEYS, SUBSCRIPTION_BADGES, subscriptionNote } from './commercial-display';
import { MetricValue } from '../../../shared/dashboard/metric-value/metric-value';
import { NwStatusBadge } from '../../../shared/ui/status-badge/status-badge';
import { platformPath, platformSubscriptionsPath } from '../../../core/context/scope-context';
import { NwDatePipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDialog } from '../../../shared/ui/dialog/dialog';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { OrganizationDetail, OrganizationMetadata } from '../domain/organization.model';
import { OrganizationActivityPanel, OrganizationActivityPanelData } from './organization-activity-panel';

export interface OrganizationDetailsPanelData {
  activity: OrganizationActivityPanelData | null;
  detail: () => OrganizationDetail;
  platform: PlatformRef;
  mayEdit: boolean;
  editAvailable: boolean;
  edit: () => void;
  showCommercial: boolean;
  canViewSubscriptions: boolean;
  commercial: () => ViewState<OrganizationCommercial>;
  retryCommercial: () => void;
}

const ENTITLEMENT_KEYS = {
  entitled: 'organizations.entitlement.entitled',
  entitledInGrace: 'organizations.entitlement.entitledInGrace',
  notEntitled: 'organizations.entitlement.notEntitled',
} as const satisfies Record<OrganizationEntitlement, string>;
const SUBSCRIPTION_NOTE_KEYS = {
  active: 'organizations.detail.activeNote',
  grace: 'organizations.detail.graceNote',
  none: 'organizations.detail.noSubscriptionNote',
} as const satisfies Record<OrganizationSubscriptionState, string>;

const FIELDS = [
  { key: 'type', label: 'organizations.detail.type', ltr: false },
  { key: 'taxCode', label: 'organizations.detail.taxCode', ltr: true },
  { key: 'phone', label: 'organizations.detail.phone', ltr: true },
  { key: 'address', label: 'organizations.detail.address', ltr: false },
] as const satisfies readonly { key: keyof OrganizationMetadata; label: string; ltr: boolean }[];

@Component({
  selector: 'adm-organization-details-panel',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwDatePipe,
    NwButton,
    NwDialog,
    NwIcon,
    MetricValue,
    NwStatusBadge,
    OrganizationActivityPanel,
  ],
  template: `
    <nw-dialog
      size="side"
      [title]="'organizations.detail.overview' | transloco"
      [closeLabel]="'common.close' | transloco"
    >
      @if (data.activity; as activity) {
        <nav class="tabs" [attr.aria-label]="'organizations.detail.overview' | transloco">
          <button type="button" [attr.aria-current]="section() === 'profile' ? 'page' : null" (click)="section.set('profile')">{{ 'organizations.detail.detailsPanel' | transloco }}</button>
          <button type="button" [attr.aria-current]="section() === 'activity' ? 'page' : null" (click)="section.set('activity')">{{ 'organizations.detail.activity' | transloco }}</button>
        </nav>
        <div [hidden]="section() !== 'activity'"><adm-organization-activity-panel [data]="activity" /></div>
      }
      <div [hidden]="section() !== 'profile'">
      @let detail = data.detail();
      <div class="summary">
        <span class="summary__icon"><nw-icon name="building-2" size="lg" /></span
        ><strong
          ><bdi>{{ detail.name }}</bdi></strong
        >
      </div>
      @if (data.showCommercial) {
        <div
          class="tabs"
          role="tablist"
          [attr.aria-label]="'organizations.detail.detailsPanel' | transloco"
          (keydown)="onTabKey($event)"
        >
          <button
            id="organization-details-tab-about"
            type="button"
            role="tab"
            [attr.aria-selected]="tab() === 'about'"
            [attr.tabindex]="tab() === 'about' ? 0 : -1"
            aria-controls="organization-details-about"
            (click)="tab.set('about')"
          >
            <nw-icon name="building-2" size="sm" />{{ 'organizations.detail.about' | transloco }}
          </button>
          <button
            id="organization-details-tab-payments"
            type="button"
            role="tab"
            [attr.aria-selected]="tab() === 'payments'"
            [attr.tabindex]="tab() === 'payments' ? 0 : -1"
            aria-controls="organization-details-payments"
            (click)="tab.set('payments')"
          >
            <nw-icon name="credit-card" size="sm" />{{
              'organizations.detail.payments' | transloco
            }}
          </button>
        </div>
      }
      @if (tab() === 'about') {
        <div
          id="organization-details-about"
          [attr.role]="data.showCommercial ? 'tabpanel' : null"
          [attr.aria-labelledby]="data.showCommercial ? 'organization-details-tab-about' : null"
        >
          <section class="details">
            <h3>{{ 'organizations.detail.about' | transloco }}</h3>
            <dl>
              <div>
                <dt>{{ 'organizations.detail.platform' | transloco }}</dt>
                <dd>
                  <a [routerLink]="platformPath(data.platform.id)" (click)="close()"
                    ><bdi>{{ data.platform.name }}</bdi></a
                  >
                </dd>
              </div>
              <div>
                <dt>{{ 'organizations.detail.organizationId' | transloco }}</dt>
                <dd>
                  <code dir="ltr" translate="no">{{ detail.id }}</code>
                </dd>
              </div>
              <div>
                <dt>{{ 'organizations.detail.createdAt' | transloco }}</dt>
                <dd>{{ detail.createdAt | nwDate: 'date' }}</dd>
              </div>
              @for (field of fields; track field.key) {
                @let value = detail.metadata[field.key];
                @if (value !== null) {
                  <div>
                    <dt>{{ field.label | transloco }}</dt>
                    <dd>
                      <bdi [attr.dir]="field.ltr ? 'ltr' : null">{{ value }}</bdi>
                    </dd>
                  </div>
                }
              }
            </dl>
          </section>
          @if (data.mayEdit) {
            <button
              nw-button
              variant="secondary"
              type="button"
              [attr.aria-disabled]="!data.editAvailable || null"
              [attr.aria-describedby]="
                data.editAvailable ? null : 'organization-edit-panel-unavailable'
              "
              (click)="edit()"
            >
              <nw-icon name="pencil" size="sm" />{{ 'organizations.edit.open' | transloco }}
            </button>
            @if (!data.editAvailable) {
              <span id="organization-edit-panel-unavailable" class="nw-visually-hidden">{{
                'organizations.edit.notInBuildReason' | transloco
              }}</span>
            }
          }
        </div>
      }
      @if (data.showCommercial && tab() === 'payments') {
        <div
          id="organization-details-payments"
          role="tabpanel"
          aria-labelledby="organization-details-tab-payments"
        >
          @let commercial = data.commercial();
          <section class="details">
            <h3>{{ 'organizations.detail.subscription' | transloco }}</h3>
            @if (commercial.status === 'success') {
              @let subscription = commercial.data.subscription;
              @let entitlement = commercial.data.entitlement;
              @if (subscription.status === 'available') {
                @let current = subscription.data;
                <dl>
                  <div>
                    <dt>{{ 'organizations.detail.subscriptionState' | transloco }}</dt>
                    <dd>
                      <nw-status-badge [tone]="badges[current.state].tone">{{
                        badges[current.state].key | transloco
                      }}</nw-status-badge>
                    </dd>
                  </div>
                  @if (current.state === 'active' && current.endsAt) {
                    <div>
                      <dt>{{ 'organizations.detail.endsAt' | transloco }}</dt>
                      <dd>
                        {{ current.endsAt | nwDate: 'date' }}
                        @if (noteOf(current); as note) {
                          <nw-status-badge tone="warning">{{
                            'organizations.subscription.ends'
                              | transloco: { when: note.at | nwDate: 'until' }
                          }}</nw-status-badge>
                        }
                      </dd>
                    </div>
                  }
                  @if (current.state === 'grace') {
                    @if (current.endsAt) {
                      <div>
                        <dt>{{ 'organizations.detail.endedAt' | transloco }}</dt>
                        <dd>{{ current.endsAt | nwDate: 'date' }}</dd>
                      </div>
                    }
                    @if (current.graceEndsAt) {
                      <div>
                        <dt>{{ 'organizations.detail.graceEndsAt' | transloco }}</dt>
                        <dd>{{ current.graceEndsAt | nwDate: 'date-time' }}</dd>
                      </div>
                    }
                  }
                  <div>
                    <dt>{{ 'organizations.detail.entitledNow' | transloco }}</dt>
                    <dd>
                      {{
                        (entitlement.status === 'available'
                          ? entitlementKeys[entitlement.data]
                          : 'organizations.table.unavailable'
                        ) | transloco
                      }}
                    </dd>
                  </div>
                </dl>
                <p class="subscription-note">
                  {{ subscriptionNoteKeys[current.state] | transloco }}
                </p>
                @if (data.canViewSubscriptions) {
                  <a [routerLink]="platformSubscriptionsPath(data.platform.id)" (click)="close()">{{
                    'organizations.detail.platformSubscriptions' | transloco
                  }}</a>
                }
              } @else {
                <p class="muted">{{ 'organizations.states.sectionUnavailable' | transloco }}</p>
                <button nw-button variant="ghost" type="button" (click)="data.retryCommercial()">
                  {{ 'organizations.states.retry' | transloco }}
                </button>
              }
            } @else if (commercial.status === 'error' || commercial.status === 'forbidden') {
              <p class="muted">{{ 'organizations.states.sectionUnavailable' | transloco }}</p>
              @if (commercial.status === 'error') {
                <button nw-button variant="ghost" type="button" (click)="data.retryCommercial()">
                  {{ 'organizations.states.retry' | transloco }}
                </button>
              }
            } @else {
              <p class="muted">{{ 'organizations.states.loadingSection' | transloco }}</p>
            }
          </section>
          <section class="details">
            <h3>{{ 'organizations.detail.payments' | transloco }}</h3>
            @if (commercial.status === 'success') {
              @let issues = commercial.data.paymentIssues;
              @if (issues.status === 'available' && issues.data.status === 'available') {
                @if (issues.data.value > 0) {
                  <p class="payment-alert">
                    <nw-icon name="circle-alert" size="sm" /><span
                      ><strong
                        >{{ 'organizations.detail.paymentIssues' | transloco }}:
                        <adm-metric-value [metric]="issues.data" /></strong
                      ><br />{{ 'organizations.detail.paymentIssuesNote' | transloco }}</span
                    >
                  </p>
                } @else {
                  <p class="muted">{{ 'organizations.detail.noPaymentIssues' | transloco }}</p>
                }
              } @else {
                <p class="muted">{{ 'organizations.states.sectionUnavailable' | transloco }}</p>
              }
            } @else if (commercial.status === 'error' || commercial.status === 'forbidden') {
              <p class="muted">{{ 'organizations.states.sectionUnavailable' | transloco }}</p>
              @if (commercial.status === 'error') {
                <button nw-button variant="ghost" type="button" (click)="data.retryCommercial()">
                  {{ 'organizations.states.retry' | transloco }}
                </button>
              }
            } @else {
              <p class="muted">{{ 'organizations.states.loadingSection' | transloco }}</p>
            }
          </section>
          <section class="details">
            <h3>{{ 'organizations.detail.assistedPayments' | transloco }}</h3>
            @if (commercial.status === 'success') {
              @let eligibility = commercial.data.assistedPayments;
              @if (eligibility.status === 'available') {
                @let keys = eligibilityKeys[eligibility.data.status];
                <p data-eligibility>
                  <nw-status-badge tone="info">{{ keys.value | transloco }}</nw-status-badge>
                </p>
                <p class="muted">{{ keys.detail | transloco }}</p>
              } @else {
                <p class="muted">{{ 'organizations.states.sectionUnavailable' | transloco }}</p>
              }
            } @else if (commercial.status === 'error' || commercial.status === 'forbidden') {
              <p class="muted">{{ 'organizations.states.sectionUnavailable' | transloco }}</p>
              @if (commercial.status === 'error') {
                <button nw-button variant="ghost" type="button" (click)="data.retryCommercial()">
                  {{ 'organizations.states.retry' | transloco }}
                </button>
              }
            } @else {
              <p class="muted">{{ 'organizations.states.loadingSection' | transloco }}</p>
            }
          </section>
        </div>
      }
      </div>
    </nw-dialog>
  `,
  styles: `
    .tabs {
      display: flex;
      gap: 0.25rem;
      padding: 0.25rem;
      margin-block-end: 1.5rem;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-lg);
      background: var(--nw-surface-sunken);
    }
    .tabs button {
      display: inline-flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-block-size: 2.75rem;
      padding: 0.5rem 1rem;
      border: 0;
      border-radius: var(--nw-radius-md);
      background: transparent;
      color: var(--nw-text-secondary);
      font: inherit;
      font-weight: var(--nw-font-weight-medium);
      cursor: pointer;
    }
    .tabs button[aria-selected='true'], .tabs button[aria-current='page'] {
      background: var(--nw-surface-raised);
      color: var(--nw-text-brand);
      box-shadow: var(--nw-shadow-sm);
      font-weight: var(--nw-font-weight-semibold);
    }
    .tabs button:focus-visible {
      outline: 2px solid var(--nw-focus-ring);
      outline-offset: 2px;
    }
    .muted {
      margin: 0;
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-sm);
    }
    .subscription-note {
      margin: 1rem 0;
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-sm);
    }
    .payment-alert {
      display: flex;
      gap: 0.5rem;
      margin: 0;
      color: var(--nw-status-warning-fg);
      font-size: var(--nw-text-size-sm);
    }
    .summary {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      margin-block-end: 1.5rem;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-lg);
      background: var(--nw-surface-sunken);
      overflow-wrap: anywhere;
    }
    .summary__icon {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 3rem;
      block-size: 3rem;
      border-radius: var(--nw-radius-md);
      background: var(--nw-surface-brand-subtle);
      color: var(--nw-text-brand);
    }
    .details {
      padding: 1.25rem;
      margin-block-end: 1.5rem;
      border: 1px solid var(--nw-border-subtle);
      border-radius: var(--nw-radius-lg);
      background: var(--nw-surface-raised);
    }
    h3 {
      margin: 0 0 1rem;
      font-size: var(--nw-text-size-sm);
      color: var(--nw-text-primary);
    }
    dl {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 1.25rem 1.5rem;
      margin: 0;
    }
    dl div {
      min-inline-size: 0;
    }
    dt {
      margin-block-end: 0.35rem;
      color: var(--nw-text-secondary);
      font-size: var(--nw-text-size-xs);
    }
    dd {
      margin: 0;
      color: var(--nw-text-primary);
      font-size: var(--nw-text-size-sm);
      font-weight: var(--nw-font-weight-medium);
      overflow-wrap: anywhere;
    }
    code {
      font-size: var(--nw-text-size-xs);
    }
    a {
      color: var(--nw-text-link);
    }
    @media (max-width: 30rem) {
      dl {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationDetailsPanel {
  protected readonly data = inject<OrganizationDetailsPanelData>(DIALOG_DATA);
  protected readonly section = signal<'profile' | 'activity'>('profile');
  protected readonly tab = signal<'about' | 'payments'>('about');
  protected onTabKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget as HTMLElement).direction === 'rtl';
    const next =
      event.key === 'Home'
        ? 'about'
        : event.key === 'End'
          ? 'payments'
          : event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
            ? 'payments'
            : 'about';
    this.tab.set(next);
    (event.currentTarget as HTMLElement)
      .querySelector<HTMLButtonElement>(`#organization-details-tab-${next}`)
      ?.focus();
  }
  private readonly now = inject(NW_CLOCK);
  protected readonly badges = SUBSCRIPTION_BADGES;
  protected readonly entitlementKeys = ENTITLEMENT_KEYS;
  protected readonly subscriptionNoteKeys = SUBSCRIPTION_NOTE_KEYS;
  protected readonly platformSubscriptionsPath = platformSubscriptionsPath;
  protected noteOf(subscription: OrganizationSubscription) {
    return subscriptionNote(subscription, this.now());
  }
  protected readonly fields = FIELDS;
  protected readonly eligibilityKeys = ELIGIBILITY_KEYS;
  protected readonly platformPath = platformPath;
  private readonly ref = inject(DialogRef);
  protected close(): void {
    this.ref.close();
  }
  protected edit(): void {
    if (this.data.editAvailable) this.data.edit();
  }
}
