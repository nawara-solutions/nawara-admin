import { DEMO_SIGN_IN_HINT } from '../core/auth/auth.fixtures';
import { MOCK_AUTH_PROVIDERS } from '../core/auth/auth.mock';
import { DemoBindings } from '../core/config/app-environment';
import { MOCK_STEP_UP_PROVIDERS } from '../core/auth/step-up.mock';
import { MOCK_SCOPE_DIRECTORY_PROVIDERS } from '../core/context/scope-directory.mock';
import { MOCK_SERVICE_INVENTORY_PROVIDERS } from '../core/core-services/service-inventory.mock';
import { MOCK_NOTIFICATION_SUMMARY_PROVIDERS } from '../core/notifications/notification-summary.mock';
import {
  MOCK_COMMERCIAL_SUMMARY_PROVIDERS,
  MOCK_COMPANY_OVERVIEW_PROVIDERS,
} from '../features/company-overview/data-access/company-overview.mock';
import {
  MOCK_PLATFORM_COMMERCIAL_PROVIDERS,
  MOCK_PLATFORM_DASHBOARD_PROVIDERS,
} from '../features/platform-dashboard/data-access/platform-dashboard.mock';
import {
  MOCK_ORGANIZATION_COMMERCIAL_PROVIDERS,
  MOCK_ORGANIZATION_PROVIDERS,
} from '../features/organizations/data-access/organization.mock';
import { MOCK_ADMIN_INVITATION_PROVIDERS } from '../features/organizations/data-access/admin-invitation.mock';
import { MOCK_MEMBERSHIP_PROVIDERS } from '../features/organizations/data-access/membership.mock';
import { MOCK_ORGANIZATION_COMMAND_PROVIDERS } from '../features/organizations/data-access/organization-command.mock';
import { MOCK_ACTIVITY_PROVIDERS } from '../features/activity/data-access/activity.mock';
import { MOCK_RELEASE_INFORMATION_PROVIDERS } from '../features/releases/data-access/release-information.mock';
import { MOCK_BILLING_PROVIDERS } from '../features/billing/data-access/billing.mock';
import { MOCK_LICENSES_PROVIDERS } from '../features/licenses/data-access/licenses.mock';
import { MOCK_OPERATOR_PROVIDERS } from '../features/operators/data-access/operator.mock';
import { MOCK_PLATFORM_COMMAND_PROVIDERS } from '../features/platforms/data-access/platform-command.mock';
import { MOCK_PLATFORM_DIRECTORY_PROVIDERS } from '../features/platforms/data-access/platform-directory.mock';

/**
 * The demo composition root: the only module that gathers mock adapters and the fictional accounts. It is imported
 * lazily by src/environments/environment.development.ts and by nothing else, so production builds never contain it.
 */
export const DEMO_BINDINGS: DemoBindings = {
  signIn: DEMO_SIGN_IN_HINT,
  providers: {
    auth: MOCK_AUTH_PROVIDERS,
    scopeDirectory: MOCK_SCOPE_DIRECTORY_PROVIDERS,
    notificationSummary: MOCK_NOTIFICATION_SUMMARY_PROVIDERS,
    companyOverview: MOCK_COMPANY_OVERVIEW_PROVIDERS,
    platformDirectory: MOCK_PLATFORM_DIRECTORY_PROVIDERS,
    commercialSummary: MOCK_COMMERCIAL_SUMMARY_PROVIDERS,
    licenses: MOCK_LICENSES_PROVIDERS,
    billing: MOCK_BILLING_PROVIDERS,
    activity: MOCK_ACTIVITY_PROVIDERS,
    services: MOCK_SERVICE_INVENTORY_PROVIDERS,
    releases: MOCK_RELEASE_INFORMATION_PROVIDERS,
    platformDashboard: MOCK_PLATFORM_DASHBOARD_PROVIDERS,
    platformCommercial: MOCK_PLATFORM_COMMERCIAL_PROVIDERS,
    organizations: MOCK_ORGANIZATION_PROVIDERS,
    organizationCommercial: MOCK_ORGANIZATION_COMMERCIAL_PROVIDERS,
    platformCommands: MOCK_PLATFORM_COMMAND_PROVIDERS,
    organizationCommands: MOCK_ORGANIZATION_COMMAND_PROVIDERS,
    adminInvitations: MOCK_ADMIN_INVITATION_PROVIDERS,
    memberships: MOCK_MEMBERSHIP_PROVIDERS,
    operators: MOCK_OPERATOR_PROVIDERS,
    stepUp: MOCK_STEP_UP_PROVIDERS,
  },
};
