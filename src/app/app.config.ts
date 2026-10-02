import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { routes } from './app.routes';
import { provideSession } from './core/auth/provide-session';
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
    provideRouter(routes),
    { provide: TitleStrategy, useClass: LocalizedTitleStrategy },
    provideI18n(),
    provideTheme(),
    provideSession(),
  ],
};
