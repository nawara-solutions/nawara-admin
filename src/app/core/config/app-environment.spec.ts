import { Provider } from '@angular/core';
import { environment as development } from '../../../environments/environment.development';
import {
  AppEnvironment,
  DemoBindings,
  adapterProviders,
  assertEnvironment,
  isDemo,
} from './app-environment';

class Gateway {}
class Unavailable {}
class Mock {}

/*
 * The production environment file itself cannot be imported here: `ng test` applies the development `fileReplacements`.
 * Its guarantee (no demo module in a production build) is checked on the real bundle by `npm run check:production`.
 */
const production: AppEnvironment = { production: true, demo: null };

const UNAVAILABLE: Provider[] = [{ provide: Gateway, useClass: Unavailable }];
const bindings: DemoBindings = {
  signIn: {
    accounts: [],
    password: 'p',
    code: 'c',
    operators: [],
    workingCode: 'w',
    newOperators: [],
    confirmationCode: 'k',
  },
  providers: {
    auth: [],
    scopeDirectory: [],
    notificationSummary: [],
    platformDirectory: [],
    companyOverview: [{ provide: Gateway, useClass: Mock }],
    commercialSummary: [],
    serviceHealth: [],
  },
};

describe('app environment and adapter configuration', () => {
  it('a production environment without demo data is valid and not a demo', () => {
    expect(assertEnvironment(production)).toBe(production);
    expect(isDemo(production)).toBe(false);
  });

  it('the development environment enables the demo slice', () => {
    expect(development.production).toBe(false);
    expect(isDemo(development)).toBe(true);
  });

  it('refuses a production environment with demo data', () => {
    const tampered: AppEnvironment = { production: true, demo: { load: async () => bindings } };
    expect(() => assertEnvironment(tampered)).toThrow(/production build cannot enable demo data/);
  });

  it('binds the unavailable adapter, never a mock, without demo data', async () => {
    const providers = await adapterProviders(production, 'companyOverview', UNAVAILABLE);
    expect(providers).toEqual(UNAVAILABLE);
  });

  it('binds the mock adapter in a demo build', async () => {
    const demo: AppEnvironment = { production: false, demo: { load: async () => bindings } };
    expect(await adapterProviders(demo, 'companyOverview', UNAVAILABLE)).toEqual([
      { provide: Gateway, useClass: Mock },
    ]);
  });

  it('refuses to load mocks into a tampered production environment', async () => {
    const load = vi.fn(async () => bindings);
    const tampered: AppEnvironment = { production: true, demo: { load } };
    await expect(adapterProviders(tampered, 'companyOverview', UNAVAILABLE)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
});
