import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { ThemeService } from './theme.service';

/** Starts the theme service at bootstrap so the system preference is followed from the first render (§14). */
export function provideTheme(): EnvironmentProviders {
  return provideAppInitializer(() => {
    inject(ThemeService);
  });
}
