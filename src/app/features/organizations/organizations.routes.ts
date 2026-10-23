import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { OrganizationDetailFacade } from './application/organization-detail.facade';
import { OrganizationDirectoryFacade } from './application/organization-directory.facade';
import { MembershipActionLock } from './application/membership-action-support';
import { MembershipDecisionAction } from './application/membership-decision.action';
import { MembershipRevokeAction } from './application/membership-revoke.action';
import { OrganizationAdminRoleAction } from './application/organization-admin-role.action';
import { OrganizationMembersFacade } from './application/organization-members.facade';
import { MEMBERS_SEGMENT } from '../../core/context/scope-context';
import { MembershipGateway, UnavailableMembershipGateway } from './data-access/membership.gateway';
import {
  ADMIN_INVITATION_PROVIDERS,
  organizationActionProviders,
} from './organization-actions.providers';
import {
  OrganizationCommercialGateway,
  UnavailableOrganizationCommercialGateway,
} from './data-access/organization-commercial.gateway';
import {
  OrganizationGateway,
  UnavailableOrganizationGateway,
} from './data-access/organization.gateway';

/**
 * Organization routes, inside platform scope (`/platforms/:platformId/organizations[/:organizationId[/members[/…]]]`):
 * the directory, one Organization's detail, and its members (P5-S1). The gateways (hierarchy, the owner's commercial facts) and the
 * Organization actions ("Create organization", "Edit details") are bound here (docs/ARCHITECTURE.md §3): mock adapters
 * in a demo build, `unavailable` adapters otherwise. No Organization context or scope: each facade follows the URL.
 */
export async function loadOrganizationsRoutes(environment: AppEnvironment): Promise<Routes> {
  const [organizations, commercial, memberships, actions] = await Promise.all([
    adapterProviders(environment, 'organizations', [
      { provide: OrganizationGateway, useClass: UnavailableOrganizationGateway },
    ]),
    adapterProviders(environment, 'organizationCommercial', [
      {
        provide: OrganizationCommercialGateway,
        useClass: UnavailableOrganizationCommercialGateway,
      },
    ]),
    adapterProviders(environment, 'memberships', [
      { provide: MembershipGateway, useClass: UnavailableMembershipGateway },
    ]),
    organizationActionProviders(environment),
  ]);
  return [
    {
      path: '',
      providers: [...organizations, ...commercial, ...memberships, ...actions],
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
          providers: [OrganizationDetailFacade, ...ADMIN_INVITATION_PROVIDERS],
          loadComponent: () =>
            import('./pages/organization-detail.page').then((m) => m.OrganizationDetailPage),
        },
        {
          // An Organization's members and one membership (P5-S1), decisions on its requests (P5-S2), revocation (P5-S3a)
          // and the organization-admin role (P5-S3b; its step-up gateway is the parent route's): one facade for both
          // pages, so the lists are loaded once; the Organization is the detail facade's (Platform-checked first); one
          // set of actions for both, single-flight across them (`MembershipActionLock`).
          path: `:organizationId/${MEMBERS_SEGMENT}`,
          providers: [
            OrganizationDetailFacade,
            OrganizationMembersFacade,
            MembershipActionLock,
            MembershipDecisionAction,
            MembershipRevokeAction,
            OrganizationAdminRoleAction,
          ],
          children: [
            {
              path: '',
              pathMatch: 'full',
              title: 'titles.members',
              loadComponent: () =>
                import('./pages/organization-members.page').then((m) => m.OrganizationMembersPage),
            },
            {
              path: ':membershipId',
              title: 'titles.membership',
              loadComponent: () =>
                import('./pages/membership-detail.page').then((m) => m.MembershipDetailPage),
            },
          ],
        },
      ],
    },
  ];
}
