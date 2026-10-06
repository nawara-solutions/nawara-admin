import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import { Actor } from '../../core/auth/actor';
import { AuthSession } from '../../core/auth/auth-session';
import { APP_ENVIRONMENT, DemoBindings } from '../../core/config/app-environment';
import { ScopeContext } from '../../core/context/scope-context';
import { DEMO_COMPANY_ID } from '../../core/context/scope-directory.fixtures';
import { ScopeDirectoryGateway } from '../../core/context/scope-directory.gateway';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../core/context/scope-directory.mock';
import { platformId } from '../../core/context/scope.model';
import { Breadcrumbs } from './breadcrumbs';

const DEMO: DemoBindings = {
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
    companyOverview: [],
    commercialSummary: [],
    serviceHealth: [],
  },
};

async function render(actor: Actor) {
  TestBed.configureTestingModule({
    imports: [
      Breadcrumbs,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      ScopeContext,
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const fixture = TestBed.createComponent(Breadcrumbs);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('Breadcrumbs', () => {
  it('shows an owner the Company, linked to the overview', async () => {
    const nav = await render({
      kind: 'owner',
      userId: 'o',
      email: 'owner@x.invalid',
      companyId: DEMO_COMPANY_ID,
    });
    expect(nav.querySelector('.breadcrumbs__home')?.getAttribute('href')).toBe('/overview');
    expect(nav.querySelector('.breadcrumbs__home')?.getAttribute('aria-label')).toBe(
      en.shell.breadcrumb.home,
    );
    expect(nav.textContent).toContain(en.shell.breadcrumb.company);
  });

  it('never implies company-wide scope to an operator', async () => {
    const nav = await render({
      kind: 'operator',
      userId: 'p',
      email: null,
      phone: '+99900000001',
      platformAssignments: [platformId('school')],
    });
    const home = nav.querySelector('.breadcrumbs__home');
    expect(home?.getAttribute('href')).toBe('/platforms/school');
    expect(home?.getAttribute('aria-label')).toBe(en.shell.context.assigned);
    expect(nav.textContent).toContain(en.shell.context.assigned);
    expect(nav.textContent).not.toContain(en.shell.breadcrumb.company);
    expect(nav.querySelector('a[href="/overview"]')).toBeNull();
  });
});
