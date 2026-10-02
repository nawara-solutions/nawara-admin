import { DEMO_SIGN_IN_HINT } from '../core/auth/auth.fixtures';
import { MOCK_AUTH_PROVIDERS } from '../core/auth/auth.mock';
import { DemoBindings } from '../core/config/app-environment';
import { MOCK_SCOPE_DIRECTORY_PROVIDERS } from '../core/context/scope-directory.mock';
import { MOCK_NOTIFICATION_SUMMARY_PROVIDERS } from '../core/notifications/notification-summary.mock';
import {
  MOCK_COMMERCIAL_SUMMARY_PROVIDERS,
  MOCK_COMPANY_OVERVIEW_PROVIDERS,
  MOCK_SERVICE_HEALTH_PROVIDERS,
} from '../features/company-overview/data-access/company-overview.mock';
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
    serviceHealth: MOCK_SERVICE_HEALTH_PROVIDERS,
  },
};
