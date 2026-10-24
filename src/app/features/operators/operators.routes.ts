import { Routes } from '@angular/router';
import { AppEnvironment, adapterProviders } from '../../core/config/app-environment';
import { BREADCRUMB_DATA, BREADCRUMB_PARENT_DATA } from '../../layout/breadcrumbs/breadcrumbs';
import { OperatorDetailFacade } from './application/operator-detail.facade';
import { OperatorDirectoryFacade } from './application/operator-directory.facade';
import { OPERATORS_PATH } from './application/operator-paths';
import { OperatorBlockAction } from './application/operator-block.action';
import { PlatformAccessAction } from './application/platform-access.action';
import {
  OperatorAccountGateway,
  UnavailableOperatorAccountGateway,
} from './data-access/operator-account.gateway';
import { StepUpGateway, UnavailableStepUpGateway } from '../../core/auth/step-up.gateway';
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
 * capability guard covers direct URLs). The operator gateways and the owner's step-up gateway are bound here
 * (docs/ARCHITECTURE.md §3): the mock adapters in a demo build, the `unavailable` adapters otherwise. The detail route
 * holds the Platform access action (P6-S2: give and remove, owner only).
 */
export async function loadOperatorsRoutes(environment: AppEnvironment): Promise<Routes> {
  const [operators, stepUp] = await Promise.all([
    adapterProviders(environment, 'operators', [
      { provide: OperatorDirectoryGateway, useClass: UnavailableOperatorDirectoryGateway },
      { provide: OperatorAssignmentGateway, useClass: UnavailableOperatorAssignmentGateway },
      { provide: OperatorAccountGateway, useClass: UnavailableOperatorAccountGateway },
    ]),
    adapterProviders(environment, 'stepUp', [
      { provide: StepUpGateway, useClass: UnavailableStepUpGateway },
    ]),
  ]);
  return [
    {
      path: '',
      providers: [...operators, ...stepUp],
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
          providers: [OperatorDetailFacade, PlatformAccessAction, OperatorBlockAction],
          loadComponent: () =>
            import('./pages/operator-detail.page').then((m) => m.OperatorDetailPage),
        },
      ],
    },
  ];
}
