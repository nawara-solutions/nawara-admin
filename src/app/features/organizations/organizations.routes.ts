import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { OrganizationDetailFacade } from './application/organization-detail.facade';
import { OrganizationDirectoryFacade } from './application/organization-directory.facade';
import { createOrganizationProviders } from './create-organization.providers';
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
 * directory and one Organization's detail. The gateways (hierarchy, the owner's commercial facts) and "Create
 * organization" are bound here (docs/ARCHITECTURE.md §3): mock adapters in a demo build, `unavailable` adapters
 * otherwise. No Organization context
 * or scope: each facade follows the URL.
 */
export async function loadOrganizationsRoutes(environment: AppEnvironment): Promise<Routes> {
  const [organizations, commercial, create] = await Promise.all([
    adapterProviders(environment, 'organizations', [
      { provide: OrganizationGateway, useClass: UnavailableOrganizationGateway },
    ]),
    adapterProviders(environment, 'organizationCommercial', [
      {
        provide: OrganizationCommercialGateway,
        useClass: UnavailableOrganizationCommercialGateway,
      },
    ]),
    createOrganizationProviders(environment),
  ]);
  return [
    {
      path: '',
      providers: [...organizations, ...commercial, ...create],
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
