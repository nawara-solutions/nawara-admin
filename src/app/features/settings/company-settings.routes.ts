import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { CompanySettingsFacade } from './application/company-settings.facade';
import {
  CompanySettingsGateway,
  UnavailableCompanySettingsGateway,
} from './data-access/company-settings.gateway';

/**
 * Company settings (`/settings/company`; P9-S3), the owner only (the parent route's capability guard covers direct
 * URLs). The gateway is bound here (docs/ARCHITECTURE.md §3): the mock adapter in a demo build, the `unavailable`
 * adapter otherwise, so a production build never shows a demo Company.
 */
export async function loadCompanySettingsRoutes(environment: AppEnvironment): Promise<Routes> {
  const company = await adapterProviders(environment, 'companySettings', [
    { provide: CompanySettingsGateway, useClass: UnavailableCompanySettingsGateway },
  ]);
  return [
    {
      path: '',
      providers: [...company, CompanySettingsFacade],
      loadComponent: () =>
        import('./pages/company-settings.page').then((m) => m.CompanySettingsPage),
    },
  ];
}
