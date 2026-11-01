import { TestBed } from '@angular/core/testing';
import { Route, Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../i18n/en.json';
import { environment as development } from '../environments/environment.development';
import { appRoutes } from './app.routes';
import { SESSION_UNAVAILABLE_PATH } from './core/access/access.guards';
import { APP_ENVIRONMENT, AppEnvironment } from './core/config/app-environment';
import { FOUNDATION_ROUTES } from './features/foundation/foundation.routes';

/*
 * The production environment file cannot be imported in a spec (`ng test` applies the development file replacements); its value
 * is mirrored here, and the real production bundle is checked by `npm run check:production` (no gallery code, G0-D6).
 */
const PRODUCTION: AppEnvironment = { production: true, demo: null, foundation: null };

const paths = (routes: readonly Route[]) => routes.map((r) => r.path);

async function navigate(environment: AppEnvironment, url: string) {
  TestBed.configureTestingModule({
    imports: [TranslocoTestingModule.forRoot({ langs: { en }, preloadLangs: true })],
    providers: [
      provideRouter(appRoutes(environment)),
      { provide: APP_ENVIRONMENT, useValue: environment },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  return { harness, router: TestBed.inject(Router) };
}

describe('application routes (G0-D6: the design-foundation gallery)', () => {
  it('a production configuration registers no /foundation route', () => {
    expect(paths(appRoutes(PRODUCTION))).not.toContain('foundation');
    // An environment that omits the field is treated as production-safe: no gallery.
    expect(paths(appRoutes({ production: false, demo: null }))).not.toContain('foundation');
  });

  it('the development configuration registers /foundation, loading the gallery lazily', async () => {
    const route = appRoutes(development).find((r) => r.path === 'foundation');
    expect(route?.title).toBe('titles.foundation');
    expect(await (route!.loadChildren as () => Promise<unknown>)()).toBe(FOUNDATION_ROUTES);
  });

  it('keeps every other application route, in the same order, whatever the build', () => {
    const others = paths(appRoutes(development)).filter((p) => p !== 'foundation');
    expect(paths(appRoutes(PRODUCTION))).toEqual(others);
    expect(others).toEqual(['login', 'session-unavailable', '']);
  });

  it('in production a direct /foundation address falls through like any unknown address, never to the gallery', async () => {
    for (const url of ['/foundation', '/foundation/anything', '/no-such-page']) {
      const { harness, router } = await navigate(PRODUCTION, url);
      expect([url, router.url]).toEqual([url, SESSION_UNAVAILABLE_PATH]);
      expect(
        harness.routeNativeElement?.querySelector('adm-foundation-preview-page') ?? null,
      ).toBeNull();
      TestBed.resetTestingModule();
    }
  });

  it('in a development build /foundation still opens the gallery', async () => {
    const { harness, router } = await navigate(development, '/foundation');
    expect(router.url).toBe('/foundation');
    await harness.fixture.whenStable();
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('adm-foundation-preview-page');
  });
});
