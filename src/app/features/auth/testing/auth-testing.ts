import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, of, throwError } from 'rxjs';
import en from '../../../../i18n/en.json';
import { OperatorIdentifier } from '../../../core/auth/operator-identifier';
import { AuthGateway } from '../../../core/auth/auth.gateway';
import {
  Grants,
  Identity,
  LoginOutcome,
  MfaMethod,
  PasskeyAssertion,
  PasskeyRequest,
} from '../../../core/auth/auth.model';
import { WebAuthnClient } from '../../../core/auth/webauthn-client';
import { APP_ENVIRONMENT, DemoBindings } from '../../../core/config/app-environment';
import {
  DEMO_LATENCY_MS,
  MockScopeDirectoryGateway,
} from '../../../core/context/scope-directory.mock';
import { ScopeDirectoryGateway } from '../../../core/context/scope-directory.gateway';
import { companyId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';
import { AUTH_ACCEPTED_PAUSE_MS, AuthFlowFacade } from '../application/auth-flow.facade';

const DEMO: DemoBindings = {
  signIn: { accounts: [], password: 'p', code: 'c', operators: [], workingCode: 'w' },
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

export const fail = <T>(error: AppError): Observable<T> => throwError(() => error);

/** A scripted gateway for page specs. Test-only: imported by specs and nothing else. */
export class ScriptedAuthGateway extends AuthGateway {
  methods: readonly MfaMethod[] = ['totp', 'passkey'];
  loginAnswer: Observable<LoginOutcome> | null = null;
  verifyAnswer: Observable<void> = of(undefined);
  requestCodeAnswer: Observable<void> = of(undefined);
  verifyCodeAnswer: Observable<void> = of(undefined);
  /** What the page sent, to check codes stay strings. */
  readonly codeCalls: { identifier: OperatorIdentifier; code?: string }[] = [];
  identity: Identity = { userId: 'o', email: 'owner@x.invalid', phone: null, adminTier: 'owner' };
  grantsAnswer: Grants = { companyId: companyId('company'), platformAssignments: [] };
  platformAllowed = true;

  login(): Observable<LoginOutcome> {
    return (
      this.loginAnswer ??
      of({ kind: 'mfa_required', challenge: { token: 'challenge', methods: this.methods } })
    );
  }
  verifyOwnerFactor(): Observable<void> {
    return this.verifyAnswer;
  }
  passkeyRequest(): Observable<PasskeyRequest> {
    return of({ publicKey: { challenge: new Uint8Array(1) } });
  }
  requestWorkingCode(identifier: OperatorIdentifier): Observable<void> {
    this.codeCalls.push({ identifier });
    return this.requestCodeAnswer;
  }
  verifyWorkingCode(identifier: OperatorIdentifier, code: string): Observable<void> {
    this.codeCalls.push({ identifier, code });
    return this.verifyCodeAnswer;
  }
  me(): Observable<Identity> {
    return of(this.identity);
  }
  grants(): Observable<Grants> {
    return of(this.grantsAnswer);
  }
  platformAccess(): Observable<boolean> {
    return of(this.platformAllowed);
  }
  logout(): Observable<void> {
    return of(undefined);
  }
}

/** A passkey prompt that never settles, so the waiting state can be observed. */
export class PendingWebAuthn extends WebAuthnClient {
  get(): Promise<PasskeyAssertion> {
    return new Promise(() => undefined);
  }
}

export function configureAuthPage(
  component: unknown,
  query: Record<string, string> = {},
  extra: Provider[] = [],
) {
  TestBed.configureTestingModule({
    imports: [
      component as never,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(query)) } },
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: AUTH_ACCEPTED_PAUSE_MS, useValue: 0 },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: AuthGateway, useClass: ScriptedAuthGateway },
      { provide: WebAuthnClient, useClass: PendingWebAuthn },
      { provide: ScopeDirectoryGateway, useClass: MockScopeDirectoryGateway },
      AuthFlowFacade,
      ...extra,
    ],
  });
  // Navigation is recorded, not performed: the pages are rendered alone.
  const router = TestBed.inject(Router);
  const navigations: string[] = [];
  router.navigateByUrl = async (url) => {
    navigations.push(String(url));
    return true;
  };
  router.navigate = async (commands) => {
    navigations.push(commands.join('/'));
    return true;
  };
  return {
    flow: TestBed.inject(AuthFlowFacade),
    gateway: TestBed.inject(AuthGateway) as ScriptedAuthGateway,
    navigations,
  };
}

export const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim();

export async function settle(fixture: { whenStable: () => Promise<unknown> }) {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 5));
  await fixture.whenStable();
}

export function type(input: HTMLInputElement | null, value: string) {
  if (!input) throw new Error('input not found');
  input.value = value;
  input.dispatchEvent(new Event('input'));
}
