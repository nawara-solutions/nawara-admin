import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { organizationPath, platformPath } from '../../../core/context/scope-context';
import { NwNumberPipe } from '../../../shared/format/format.pipes';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwControl, NwFormField } from '../../../shared/ui/form-field/form-field';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { BillingFacade, ISSUE_FILTERS, IssueFilter } from '../application/billing.facade';
import {
  FollowUpEntitlement,
  FollowUpSubscriptionState,
  PaymentIssueKind,
} from '../domain/billing.model';

/** Catalog keys, listed in full (never built at runtime). */
const FILTER_KEYS = {
  all: 'billing.filter.all',
  failed: 'billing.filter.failed',
  awaiting_action: 'billing.filter.awaitingAction',
} as const satisfies Record<IssueFilter, string>;

const KIND_KEYS = {
  failed: 'billing.kind.failed',
  awaiting_action: 'billing.kind.awaitingAction',
} as const satisfies Record<PaymentIssueKind, string>;

const SUBSCRIPTION_KEYS = {
  active: 'billing.subscription.active',
  grace: 'billing.subscription.grace',
  none: 'billing.subscription.none',
} as const satisfies Record<FollowUpSubscriptionState, string>;

const ENTITLEMENT_KEYS = {
  entitled: 'billing.entitlement.entitled',
  entitledInGrace: 'billing.entitlement.entitledInGrace',
  notEntitled: 'billing.entitlement.notEntitled',
} as const satisfies Record<FollowUpEntitlement, string>;

const pick = (value: string): IssueFilter | null =>
  (ISSUE_FILTERS as readonly string[]).includes(value) ? (value as IssueFilter) : null;

/**
 * Billing & payments (`/billing`; P7 design, artboard Billing): the Company owner's read-only list of payment
 * follow-ups. PROVISIONAL (proposed CF-40): a demo build reads the demo world's payment-issue records, any other build
 * says it is not available. Each follow-up names its Organization, Platform and issue; the Organization's subscription
 * and entitlement sit beside it as separate facts. No amount, invoice, balance or settlement exists here, and nothing
 * can be changed: what Core does not offer is said in one short section, without controls.
 */
@Component({
  selector: 'adm-billing-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwControl,
    NwDataState,
    NwFormField,
    NwIcon,
    NwNumberPipe,
  ],
  templateUrl: './billing.page.html',
  styleUrl: './billing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'billing' },
})
export class BillingPage {
  protected readonly facade = inject(BillingFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly filters = ISSUE_FILTERS;
  protected readonly filterKeys = FILTER_KEYS;
  protected readonly kindKeys = KIND_KEYS;
  protected readonly subscriptionKeys = SUBSCRIPTION_KEYS;
  protected readonly entitlementKeys = ENTITLEMENT_KEYS;
  protected readonly organizationPath = organizationPath;
  protected readonly platformPath = platformPath;

  protected onFilter(event: Event): void {
    const value = pick((event.target as HTMLSelectElement).value);
    if (value !== null) this.facade.filter.set(value);
  }
}
