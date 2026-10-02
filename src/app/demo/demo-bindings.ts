import { DemoBindings } from '../core/config/app-environment';
import { MOCK_SCOPE_DIRECTORY_PROVIDERS } from '../core/context/scope-directory.mock';
import { DEMO_COMPANY_ID } from '../core/context/scope-directory.fixtures';
import { MOCK_NOTIFICATION_SUMMARY_PROVIDERS } from '../core/notifications/notification-summary.mock';
import {
  MOCK_COMMERCIAL_SUMMARY_PROVIDERS,
  MOCK_COMPANY_OVERVIEW_PROVIDERS,
  MOCK_SERVICE_HEALTH_PROVIDERS,
} from '../features/company-overview/data-access/company-overview.mock';

/**
 * The demo composition root: the only module that gathers mock adapters and the fictional owner. It is imported
 * lazily by src/environments/environment.development.ts and by nothing else, so production builds never contain it.
 */
export const DEMO_BINDINGS: DemoBindings = {
  owner: {
    kind: 'owner',
    userId: '9e1d7c55-2a4b-4c3d-8e9f-0a1b2c3d4e01',
    email: 'owner@demo.nawara.invalid',
    displayName: 'Salim Anouar',
    companyId: DEMO_COMPANY_ID,
  },
  providers: {
    scopeDirectory: MOCK_SCOPE_DIRECTORY_PROVIDERS,
    notificationSummary: MOCK_NOTIFICATION_SUMMARY_PROVIDERS,
    companyOverview: MOCK_COMPANY_OVERVIEW_PROVIDERS,
    commercialSummary: MOCK_COMMERCIAL_SUMMARY_PROVIDERS,
    serviceHealth: MOCK_SERVICE_HEALTH_PROVIDERS,
  },
};
