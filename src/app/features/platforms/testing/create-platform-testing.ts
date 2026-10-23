import { Provider } from '@angular/core';
import { StepUpGateway, UnavailableStepUpGateway } from '../../../core/auth/step-up.gateway';
import { MockStepUpGateway } from '../../../core/auth/step-up.mock';
import { ScopeContext } from '../../../core/context/scope-context';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { MockScopeDirectoryGateway } from '../../../core/context/scope-directory.mock';
import { CreatePlatformAction } from '../application/create-platform.action';
import {
  PlatformCommandGateway,
  UnavailablePlatformCommandGateway,
} from '../data-access/platform-command.gateway';
import { MockPlatformCommandGateway } from '../data-access/platform-command.mock';

/**
 * Test-only: what a page that offers "Create platform" needs (the shell's scope context, the action and its
 * gateways). `demo`: the mock adapters; otherwise the unavailable ones, as in a production build.
 */
export function createPlatformTestProviders(demo: boolean): Provider[] {
  return [
    ScopeContext,
    { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
    {
      provide: PlatformCommandGateway,
      useClass: demo ? MockPlatformCommandGateway : UnavailablePlatformCommandGateway,
    },
    { provide: StepUpGateway, useClass: demo ? MockStepUpGateway : UnavailableStepUpGateway },
    CreatePlatformAction,
  ];
}
