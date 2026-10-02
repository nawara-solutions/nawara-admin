import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { APP_ENVIRONMENT, assertEnvironment } from '../config/app-environment';
import { AuthSession } from './auth-session';

/**
 * Starts the session before the first navigation. In a demo build it signs in the fictional demo owner; in every other
 * build there is no sign-in until A4, so the session stays signed out.
 */
export function provideSession(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const session = inject(AuthSession);
    const demo = assertEnvironment(inject(APP_ENVIRONMENT)).demo;
    if (demo === null) return;
    session.startDemo((await demo.load()).owner);
  });
}
