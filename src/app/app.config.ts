import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { APP_ENVIRONMENT, assertEnvironment } from './core/config/app-environment';
import { LocalizedTitleStrategy } from './core/i18n/localized-title.strategy';
import { provideI18n } from './core/i18n/provide-i18n';
import { provideTheme } from './core/theme/provide-theme';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Zoneless is Angular 22's default; declared explicitly because it is an architectural decision.
    provideZonelessChangeDetection(),
    // Build-time environment; a production build with demo data refuses to start (docs/ARCHITECTURE.md §3, §24).
    { provide: APP_ENVIRONMENT, useValue: assertEnvironment(environment) },
    // Routes for this build: the design-foundation gallery exists in development and demo builds only (G0-D6).
    provideRouter(appRoutes(environment)),
    { provide: TitleStrategy, useClass: LocalizedTitleStrategy },
    provideI18n(),
    provideTheme(),
  ],
};
