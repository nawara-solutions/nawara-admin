import { Routes } from '@angular/router';
import { capabilityGuard } from '../../core/access/access.guards';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import { AssistanceCaseFacade } from '../assistance/application/assistance-case.facade';
import { AssistanceDirectoryFacade } from '../assistance/application/assistance-directory.facade';
import { AssistanceDisputesFacade } from '../assistance/application/assistance-disputes.facade';
import { AssistanceRecoveryFacade } from '../assistance/application/assistance-recovery.facade';
import { AssistanceSettlementsFacade } from '../assistance/application/assistance-settlements.facade';
import { UNAVAILABLE_ASSISTANCE_PROVIDERS } from '../assistance/data-access/assistance.gateway';
import { BillingFacade } from './application/billing.facade';
import { BillingGateway, UnavailableBillingGateway } from './data-access/billing.gateway';

/**
 * Billing & payments (`/billing`; P7-S3), company scope, the owner only (the shell route's capability guard covers
 * direct URLs). The gateway is bound here (docs/ARCHITECTURE.md §3): the mock adapter in a demo build, the
 * `unavailable` adapter otherwise.
 *
 * Below it, the Organization Assistance case directory (`/billing/assistance`; A4), its disputes and exceptions
 * (`/billing/assistance/disputes`; A7), its late settlements and cash returns (`/billing/assistance/settlements`; A8), its
 * recovery obligations and surpluses (`/billing/assistance/recovery`; A9; all before `:requestId` so none is ever read as a case
 * reference) and one case
 * (`/billing/assistance/:requestId`; A5): read only, the owner only (their own capability guard as well), with the
 * Assistance gateway bound the same way.
 */
export async function loadBillingRoutes(environment: AppEnvironment): Promise<Routes> {
  const [billing, assistance] = await Promise.all([
    adapterProviders(environment, 'billing', [
      { provide: BillingGateway, useClass: UnavailableBillingGateway },
    ]),
    adapterProviders(environment, 'assistance', UNAVAILABLE_ASSISTANCE_PROVIDERS),
  ]);
  return [
    {
      path: '',
      providers: [...billing, BillingFacade],
      loadComponent: () => import('./pages/billing.page').then((m) => m.BillingPage),
    },
    {
      path: 'assistance',
      title: 'titles.assistance',
      data: {
        [BREADCRUMB_DATA]: 'shell.breadcrumb.assistance',
        [BREADCRUMB_PARENT_DATA]: { key: 'shell.breadcrumb.billing', link: '/billing' },
      },
      canActivate: [capabilityGuard('company.assistance.view')],
      providers: [...assistance, AssistanceDirectoryFacade],
      loadComponent: () =>
        import('../assistance/pages/assistance-directory.page').then(
          (m) => m.AssistanceDirectoryPage,
        ),
    },
    {
      path: 'assistance/disputes',
      title: 'titles.assistanceDisputes',
      data: {
        [BREADCRUMB_DATA]: 'shell.breadcrumb.assistanceDisputes',
        [BREADCRUMB_PARENT_DATA]: {
          key: 'shell.breadcrumb.assistance',
          link: '/billing/assistance',
        },
      },
      canActivate: [capabilityGuard('company.assistance.view')],
      providers: [...assistance, AssistanceDisputesFacade],
      loadComponent: () =>
        import('../assistance/pages/assistance-disputes.page').then(
          (m) => m.AssistanceDisputesPage,
        ),
    },
    {
      path: 'assistance/settlements',
      title: 'titles.assistanceSettlements',
      data: {
        [BREADCRUMB_DATA]: 'shell.breadcrumb.assistanceSettlements',
        [BREADCRUMB_PARENT_DATA]: {
          key: 'shell.breadcrumb.assistance',
          link: '/billing/assistance',
        },
      },
      canActivate: [capabilityGuard('company.assistance.view')],
      providers: [...assistance, AssistanceSettlementsFacade],
      loadComponent: () =>
        import('../assistance/pages/assistance-settlements.page').then(
          (m) => m.AssistanceSettlementsPage,
        ),
    },
    {
      path: 'assistance/recovery',
      title: 'titles.assistanceRecovery',
      data: {
        [BREADCRUMB_DATA]: 'shell.breadcrumb.assistanceRecovery',
        [BREADCRUMB_PARENT_DATA]: {
          key: 'shell.breadcrumb.assistance',
          link: '/billing/assistance',
        },
      },
      canActivate: [capabilityGuard('company.assistance.view')],
      providers: [...assistance, AssistanceRecoveryFacade],
      loadComponent: () =>
        import('../assistance/pages/assistance-recovery.page').then(
          (m) => m.AssistanceRecoveryPage,
        ),
    },
    {
      path: 'assistance/:requestId',
      title: 'titles.assistanceCase',
      data: {
        [BREADCRUMB_DATA]: 'shell.breadcrumb.assistanceCase',
        [BREADCRUMB_PARENT_DATA]: {
          key: 'shell.breadcrumb.assistance',
          link: '/billing/assistance',
        },
      },
      canActivate: [capabilityGuard('company.assistance.view')],
      providers: [...assistance, AssistanceCaseFacade],
      loadComponent: () =>
        import('../assistance/pages/assistance-case.page').then((m) => m.AssistanceCasePage),
    },
  ];
}
