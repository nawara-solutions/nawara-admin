import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import { OperatorDetailFacade } from './application/operator-detail.facade';
import { OperatorDirectoryFacade } from './application/operator-directory.facade';
import { OPERATORS_PATH } from './application/operator-paths';
import {
  OperatorAssignmentGateway,
  UnavailableOperatorAssignmentGateway,
} from './data-access/operator-assignment.gateway';
import {
  OperatorDirectoryGateway,
  UnavailableOperatorDirectoryGateway,
} from './data-access/operator-directory.gateway';

/**
 * Operators & access (`/operators[/:operatorId]`; P6-S1, read only), company scope, the owner only (the shell route's
 * capability guard covers direct URLs). Both gateways are bound here (docs/ARCHITECTURE.md §3): the mock adapters in a
 * demo build, the `unavailable` adapters otherwise. No operator change exists in this slice.
 */
export async function loadOperatorsRoutes(environment: AppEnvironment): Promise<Routes> {
  const operators = await adapterProviders(environment, 'operators', [
    { provide: OperatorDirectoryGateway, useClass: UnavailableOperatorDirectoryGateway },
    { provide: OperatorAssignmentGateway, useClass: UnavailableOperatorAssignmentGateway },
  ]);
  return [
    {
      path: '',
      providers: operators,
      children: [
        {
          path: '',
          pathMatch: 'full',
          title: 'titles.operators',
          data: { [BREADCRUMB_DATA]: 'shell.breadcrumb.operators' },
          providers: [OperatorDirectoryFacade],
          loadComponent: () =>
            import('./pages/operator-directory.page').then((m) => m.OperatorDirectoryPage),
        },
        {
          path: ':operatorId',
          title: 'titles.operator',
          data: {
            [BREADCRUMB_DATA]: 'shell.breadcrumb.operator',
            [BREADCRUMB_PARENT_DATA]: { key: 'shell.breadcrumb.operators', link: OPERATORS_PATH },
          },
          providers: [OperatorDetailFacade],
          loadComponent: () =>
            import('./pages/operator-detail.page').then((m) => m.OperatorDetailPage),
        },
      ],
    },
  ];
}
