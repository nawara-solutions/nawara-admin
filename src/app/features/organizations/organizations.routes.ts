import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { OrganizationDetailFacade } from './application/organization-detail.facade';
import { OrganizationDirectoryFacade } from './application/organization-directory.facade';
import { organizationActionProviders } from './organization-actions.providers';
import {
  OrganizationCommercialGateway,
  UnavailableOrganizationCommercialGateway,
} from './data-access/organization-commercial.gateway';
import {
  OrganizationGateway,
  UnavailableOrganizationGateway,
} from './data-access/organization.gateway';

/**
 * Organization routes, inside platform scope (`/platforms/:platformId/organizations[/:organizationId]`): the
 * directory and one Organization's detail. The gateways (hierarchy, the owner's commercial facts) and the
 * Organization actions ("Create organization", "Edit details") are bound here (docs/ARCHITECTURE.md §3): mock adapters
 * in a demo build, `unavailable` adapters otherwise. No Organization context or scope: each facade follows the URL.
 */
export async function loadOrganizationsRoutes(environment: AppEnvironment): Promise<Routes> {
  const [organizations, commercial, actions] = await Promise.all([
    adapterProviders(environment, 'organizations', [
      { provide: OrganizationGateway, useClass: UnavailableOrganizationGateway },
    ]),
    adapterProviders(environment, 'organizationCommercial', [
      {
        provide: OrganizationCommercialGateway,
        useClass: UnavailableOrganizationCommercialGateway,
      },
    ]),
    organizationActionProviders(environment),
  ]);
  return [
    {
      path: '',
      providers: [...organizations, ...commercial, ...actions],
      children: [
        {
          path: '',
          pathMatch: 'full',
          title: 'titles.organizations',
          providers: [OrganizationDirectoryFacade],
          loadComponent: () =>
            import('./pages/organization-directory.page').then((m) => m.OrganizationDirectoryPage),
        },
        {
          path: ':organizationId',
          title: 'titles.organization',
          providers: [OrganizationDetailFacade],
          loadComponent: () =>
            import('./pages/organization-detail.page').then((m) => m.OrganizationDetailPage),
        },
      ],
    },
  ];
}
