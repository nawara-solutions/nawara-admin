import { Dialog } from '@angular/cdk/dialog';
import {
  ApplicationRef,
  Component,
  EnvironmentInjector,
  createEnvironmentInjector,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Observable, Subject, tap } from 'rxjs';
import { vi } from 'vitest';
import ar from '../../../../../i18n/ar.json';
import en from '../../../../../i18n/en.json';
import fr from '../../../../../i18n/fr.json';
import { Actor } from '../../../../core/auth/actor';
import { DEMO_TOTP_CODE } from '../../../../core/auth/auth.fixtures';
import { AuthSession } from '../../../../core/auth/auth-session';
import { DemoAuthState } from '../../../../core/auth/auth.mock-state';
import {
  MOCK_AUTHORIZATION_RECEIPT_PROVIDERS,
  RECEIPT_DEMO_SCENARIO,
  ReceiptDemoScenario,
} from '../../../../core/authorization/authorization-receipt.mock';
import { ReconciliationAnswer } from '../../../../core/authorization/financial-authorization-run';
import { AuthorizationReceiptGateway } from '../../../../core/authorization/receipt.gateway';
import {
  IssuedReceipt,
  ReceiptBindingFor,
  ReceiptIssueRequest,
} from '../../../../core/authorization/receipt.model';
import { ReceiptStepUpGateway } from '../../../../core/authorization/receipt-step-up.gateway';
import { APP_ENVIRONMENT, DemoBindings } from '../../../../core/config/app-environment';
import { ScopeContext } from '../../../../core/context/scope-context';
import {
  ScopeDirectoryGateway,
  UnavailableScopeDirectoryGateway,
} from '../../../../core/context/scope-directory.gateway';
import { DEMO_LATENCY_MS } from '../../../../core/context/scope-directory.mock';
import { AppError } from '../../../../core/errors/app-error';
import { DEMO_COMPANY_ID, DEMO_OWNER_ID, DEMO_OWNER_USER_ID } from '../../../../demo/world/seed';
import { NW_CLOCK } from '../../../../shared/format/clock';
import { FinancialAuthorizationDialogs } from '../../application/financial-authorization.dialogs';
import { FINANCIAL_AUTHORIZATION_TICK_MS } from './financial-authorization-dialog';

const START = Date.parse('2026-11-01T12:00:00Z');
const ID = '00000000-0000-4000-8000-0000000000';
const id = (n: number) => `${ID}${String(n).padStart(2, '0')}`;

const owner: Actor = {
  kind: 'owner',
  userId: DEMO_OWNER_USER_ID,
  email: 'o@x.invalid',
  companyId: DEMO_COMPANY_ID,
};
const operator: Actor = {
  kind: 'operator',
  userId: 'operator-1',
  email: 'p@x.invalid',
  platformAssignments: [],
};

const refund = (): ReceiptBindingFor<'refund'> => ({
  operation: 'refund',
  audience: 'payment-service',
  companyId: DEMO_COMPANY_ID,
  refundCaseId: id(1),
  paymentId: id(2),
  amount: 45000,
  currency: 'TND',
  reason: 'duplicate_payment',
});

const writeOff = (): ReceiptBindingFor<'recovery_write_off'> => ({
  operation: 'recovery_write_off',
  audience: 'billing-service',
  companyId: DEMO_COMPANY_ID,
  obligationId: id(3),
  organizationId: id(4),
  amount: 12500,
  currency: 'TND',
});

const fraudHold = (): ReceiptBindingFor<'fraud_hold_place'> => ({
  operation: 'fraud_hold_place',
  audience: 'billing-service',
  companyId: DEMO_COMPANY_ID,
  holdId: id(5),
  beneficiaryUserId: id(6),
  productId: id(7),
  reason: 'suspected_card_fraud',
});

const DEMO = {
  signIn: { code: DEMO_TOTP_CODE },
  providers: {},
} as unknown as DemoBindings;

@Component({ template: '' })
class Empty {}

/** Answers the test controls one at a time. */
class Answers<T> {
  readonly calls: unknown[] = [];
  private readonly pending: Subject<T>[] = [];
  take(call: unknown): Observable<T> {
    this.calls.push(call);
    const answer = new Subject<T>();
    this.pending.push(answer);
    return answer;
  }
  ok(value: T): void {
    const answer = this.pending.shift();
    answer?.next(value);
    answer?.complete();
  }
  fail(error: AppError): void {
    this.pending.shift()?.error(error);
  }
}

interface Sent {
  readonly receipt: IssuedReceipt;
  readonly idempotencyKey: string;
}

async function setUp(
  options: {
    actor?: Actor | null;
    scenario?: ReceiptDemoScenario;
    lang?: 'en' | 'fr' | 'ar';
  } = {},
) {
  const clock = { now: START };
  const lang = options.lang ?? 'en';
  TestBed.configureTestingModule({
    imports: [
      TranslocoTestingModule.forRoot({
        langs: { en, fr, ar },
        translocoConfig: { availableLangs: ['en', 'fr', 'ar'], defaultLang: lang },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([{ path: '**', component: Empty }]),
      {
        provide: APP_ENVIRONMENT,
        useValue: { production: false, demo: { load: async () => DEMO } },
      },
      { provide: DEMO_LATENCY_MS, useValue: 0 },
      { provide: NW_CLOCK, useValue: () => clock.now },
      { provide: RECEIPT_DEMO_SCENARIO, useValue: options.scenario ?? 'normal' },
      { provide: FINANCIAL_AUTHORIZATION_TICK_MS, useValue: 5 },
      ...MOCK_AUTHORIZATION_RECEIPT_PROVIDERS,
    ],
  });
  // Like the route: the opener and its scope live in a child injector the dialog (root-attached) cannot see.
  const routeInjector = createEnvironmentInjector(
    [
      { provide: ScopeDirectoryGateway, useClass: UnavailableScopeDirectoryGateway },
      ScopeContext,
      FinancialAuthorizationDialogs,
    ],
    TestBed.inject(EnvironmentInjector),
  );
  const actor = options.actor === undefined ? owner : options.actor;
  const auth = TestBed.inject(DemoAuthState);
  if (actor !== null) {
    TestBed.inject(AuthSession).establish(actor);
    auth.signedIn.set(
      auth.openSession(
        { userId: actor.userId, email: null, phone: null, adminTier: actor.kind },
        actor.kind === 'owner' ? DEMO_OWNER_ID : null,
      ),
    );
  }

  const stepUp = TestBed.inject(ReceiptStepUpGateway);
  const receipts = TestBed.inject(AuthorizationReceiptGateway);
  const obtain = vi.spyOn(stepUp, 'obtain');
  const issueRequests: ReceiptIssueRequest[] = [];
  const issued: IssuedReceipt[] = [];
  const issue = receipts.issue.bind(receipts);
  vi.spyOn(receipts, 'issue').mockImplementation((request) => {
    issueRequests.push(request);
    return issue(request).pipe(tap((receipt) => issued.push(receipt)));
  });
  const consumer = new Answers<string>();
  const reads = new Answers<ReconciliationAnswer<string>>();
  const sent: Sent[] = [];

  const appRef = TestBed.inject(ApplicationRef);
  const settle = async (ms = 5) => {
    await appRef.whenStable();
    await new Promise((resolve) => setTimeout(resolve, ms));
    await appRef.whenStable();
  };
  const dialog = () => document.querySelector<HTMLElement>('adm-financial-authorization-dialog');
  const text = (selector?: string) =>
    (selector ? dialog()?.querySelector(selector) : dialog())?.textContent
      ?.replace(/\s+/g, ' ')
      .trim() ?? '';
  const button = (action: string) =>
    dialog()?.querySelector<HTMLButtonElement>(`button[data-action="${action}"]`) ?? null;
  const press = async (action: string) => {
    const target = button(action);
    if (!target) throw new Error(`no ${action} button`);
    target.click();
    await settle();
  };
  const codeField = () =>
    dialog()?.querySelector<HTMLInputElement>('input[name="step-up-code"]') ?? null;
  const verify = async (code = DEMO_TOTP_CODE) => {
    const field = codeField();
    if (!field) throw new Error('no code field');
    field.value = code;
    field.dispatchEvent(new Event('input'));
    await settle();
    await press('verify');
    await settle();
  };

  const open = async <O extends 'refund' | 'recovery_write_off' | 'fraud_hold_place'>(
    operation: O,
    binding: ReceiptIssueRequest<O>['binding'],
  ) => {
    routeInjector.get(FinancialAuthorizationDialogs).open<O, string>({
      operation,
      binding,
      submit: (receipt, request) => {
        sent.push({ receipt, idempotencyKey: request.idempotencyKey });
        return consumer.take(request);
      },
      reconcile: (b) => reads.take(b),
      simulatedConsumer: true,
    });
    await settle();
  };

  return {
    clock,
    obtain,
    issueRequests,
    issued,
    consumer,
    reads,
    sent,
    settle,
    dialog,
    text,
    button,
    press,
    codeField,
    verify,
    open,
  };
}

describe('Financial authorization dialog (F1-S6b)', () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('shows the operation, its purpose and target, and asks for the authenticator code', async () => {
    const s = await setUp();
    await s.open('refund', refund());
    expect(s.text('h2')).toBe(en.financialAuthorization.operations.refund);
    const summary = s.text('.financial-authorization__summary');
    expect(summary).toContain('refund.authorize');
    expect(summary).toContain('payment-service');
    expect(summary).toContain(id(1));
    expect(summary).toContain('duplicate_payment');
    // Minor units in their currency (3 decimals for TND).
    expect(summary).toMatch(/TND\s?45\.000/);
    for (const code of s.dialog()?.querySelectorAll('code') ?? [])
      expect(code.getAttribute('dir')).toBe('ltr');
    expect(document.activeElement).toBe(s.codeField());
    const purpose = s.codeField()!.getAttribute('aria-describedby')!.split(' ')[0]!;
    expect(document.getElementById(purpose)?.textContent).toContain(
      en.financialAuthorization.purposes.refund,
    );
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.awaitingFactor,
    );
    expect(s.text('[data-line="outcome"]')).toContain(
      en.financialAuthorization.outcome.notSubmitted,
    );
    expect(s.text()).toContain(en.financialAuthorization.notes.notCompletion);
    expect(s.text()).toContain(en.financialAuthorization.notes.simulatedConsumer);
  });

  it('verifies the code for exactly the operation’s purpose; a wrong code issues nothing', async () => {
    const s = await setUp();
    await s.open('refund', refund());
    await s.verify('000000');
    expect(s.obtain).toHaveBeenCalledTimes(1);
    expect(s.obtain.mock.calls[0]?.[0]).toBe('refund.authorize');
    expect(s.issueRequests).toHaveLength(0);
    expect(s.codeField()?.getAttribute('aria-invalid')).toBe('true');
    expect(s.text('[data-announce="urgent"]')).toBe(en.actions.failure.verificationRefused);
    expect(document.activeElement).toBe(s.codeField());

    await s.verify();
    expect(s.obtain.mock.calls[1]).toEqual([
      'refund.authorize',
      { method: 'totp', code: DEMO_TOTP_CODE },
    ]);
    expect(s.issueRequests).toHaveLength(1);
    expect(s.issueRequests[0]?.binding).toEqual(refund());
    expect(s.issueRequests[0]?.stepUp.purpose).toBe('refund.authorize');
  });

  it('issues the authorization without implying any financial result', async () => {
    const s = await setUp();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await s.open('refund', refund());
    await s.verify();
    expect(s.issued).toHaveLength(1);
    expect(s.issued[0]?.secret.held).toBe(true);
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.issuedSimulated,
    );
    expect(s.text('[data-line="authorization"]')).toContain(s.issued[0]!.receiptId);
    expect(s.text('[data-line="outcome"]')).toContain(
      en.financialAuthorization.outcome.notSubmitted,
    );
    expect(s.dialog()?.querySelector('.financial-authorization__state--success')).toBeNull();
    expect(s.dialog()?.querySelector('.nw-inline-alert--success')).toBeNull();
    expect(s.text()).not.toContain(en.financialAuthorization.outcome.applied);
    expect(s.sent).toHaveLength(0);
    expect(s.button('submit')).not.toBeNull();
    expect(s.button('discard')).not.toBeNull();
    // Focus follows the step: the main action once the code field is gone.
    expect(document.activeElement).toBe(s.button('submit'));
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('sends the held receipt once with its own key; only the service’s answer is a financial result', async () => {
    const s = await setUp();
    await s.open('refund', refund());
    await s.verify();
    await s.press('submit');
    expect(s.sent).toHaveLength(1);
    const [first] = s.sent;
    expect(first?.receipt.secret).toBe(s.issued[0]?.secret);
    expect(first?.idempotencyKey).not.toBe(s.issueRequests[0]?.idempotencyKey);
    // In flight: no move, and the dialog cannot be closed.
    expect(s.button('submit')).toBeNull();
    expect(s.text('[role="status"]')).toContain(en.financialAuthorization.outcome.submitted);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27 }));
    await s.settle();
    expect(s.dialog()).not.toBeNull();

    s.consumer.ok('applied');
    await s.settle();
    expect(s.text('[data-line="outcome"]')).toContain(en.financialAuthorization.outcome.applied);
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.consumed,
    );
    expect(first?.receipt.secret.held).toBe(false);
    expect(s.sent).toHaveLength(1);
  });

  it('refuses an operator before any verification: receipts are the owner’s', async () => {
    const s = await setUp({ actor: operator });
    await s.open('refund', refund());
    expect(s.text('.nw-inline-alert')).toBe(en.financialAuthorization.refused.actorKind);
    expect(s.codeField()).toBeNull();
    expect(s.obtain).not.toHaveBeenCalled();
    expect(s.issueRequests).toHaveLength(0);
  });

  it('refuses an operation Core does not offer, and a signed-out person', async () => {
    const s = await setUp();
    await s.open('fraud_hold_place', fraudHold());
    expect(s.text('.nw-inline-alert')).toBe(en.financialAuthorization.refused.unavailable);
    expect(s.codeField()).toBeNull();
    TestBed.inject(Dialog).closeAll();
    TestBed.inject(AuthSession).signOut();
    await s.open('refund', refund());
    expect(s.text('.nw-inline-alert')).toBe(en.financialAuthorization.refused.signedOut);
    expect(s.obtain).not.toHaveBeenCalled();
  });

  it('discards an unsent receipt at Core’s expiry; a new authorization is a new intent', async () => {
    const s = await setUp();
    await s.open('refund', refund());
    await s.verify();
    const receipt = s.issued[0]!;
    s.clock.now = Date.parse(receipt.expiresAt) + 1;
    await s.settle(20);
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.expired,
    );
    expect(receipt.secret.held).toBe(false);
    expect(s.button('submit')).toBeNull();
    expect(s.sent).toHaveLength(0);

    await s.press('startAgain');
    expect(s.codeField()?.value).toBe('');
    await s.verify();
    expect(s.issueRequests).toHaveLength(2);
    expect(s.issueRequests[1]?.idempotencyKey).not.toBe(s.issueRequests[0]?.idempotencyKey);
  });

  it('discarding, or closing the dialog, drops the secret and sends nothing', async () => {
    const s = await setUp();
    await s.open('refund', refund());
    await s.verify();
    await s.press('discard');
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.cancelled,
    );
    expect(s.issued[0]?.secret.held).toBe(false);
    expect(s.button('submit')).toBeNull();

    TestBed.inject(Dialog).closeAll();
    await s.open('refund', refund());
    await s.verify();
    expect(s.issued[1]?.secret.held).toBe(true);
    TestBed.inject(Dialog).closeAll();
    await s.settle();
    expect(s.issued[1]?.secret.held).toBe(false);
    expect(s.sent).toHaveLength(0);
  });

  it('a sign-out or a scope change ends the intent and drops the secret', async () => {
    const s = await setUp();
    await s.open('refund', refund());
    await s.verify();
    TestBed.inject(AuthSession).signOut();
    await s.settle();
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.contextChanged,
    );
    expect(s.issued[0]?.secret.held).toBe(false);

    TestBed.inject(Dialog).closeAll();
    TestBed.inject(AuthSession).establish(owner);
    await s.open('refund', refund());
    await s.verify();
    await TestBed.inject(Router).navigateByUrl('/platforms/8a1f0d2e-0000-4000-8000-000000000001');
    await s.settle();
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.contextChanged,
    );
    expect(s.issued[1]?.secret.held).toBe(false);
    expect(s.sent).toHaveLength(0);
  });

  it('no answer on a route with a key: only the identical repeat (same receipt, same key) or a check', async () => {
    const s = await setUp();
    await s.open('refund', refund());
    await s.verify();
    await s.press('submit');
    s.consumer.fail({ kind: 'network', status: 0 });
    await s.settle();
    expect(s.text('[data-line="outcome"]')).toContain(
      en.financialAuthorization.outcome.unknownReplay,
    );
    expect(s.button('submit')).toBeNull();
    expect(s.button('startAgain')).toBeNull();
    expect(s.button('reconcile')).not.toBeNull();
    await s.press('repeatIdentical');
    expect(s.sent).toHaveLength(2);
    expect(s.sent[1]?.idempotencyKey).toBe(s.sent[0]?.idempotencyKey);
    expect(s.sent[1]?.receipt.secret).toBe(s.sent[0]?.receipt.secret);
  });

  it('Core’s "not settled yet": the identical repeat is offered, never a new receipt', async () => {
    const s = await setUp();
    await s.open('refund', refund());
    await s.verify();
    await s.press('submit');
    s.consumer.fail({ kind: 'unavailable', code: 'refund_authorization_unresolved', status: 503 });
    await s.settle();
    expect(s.text('[data-line="outcome"]')).toContain(en.financialAuthorization.outcome.unresolved);
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.heldSimulated,
    );
    expect(s.text('[data-line="authorization"]')).not.toContain(
      en.financialAuthorization.authorization.issuedSimulated,
    );
    await s.press('repeatIdentical');
    expect(s.sent.map((sent) => sent.idempotencyKey)).toEqual([
      s.sent[0]?.idempotencyKey,
      s.sent[0]?.idempotencyKey,
    ]);
    expect(s.issueRequests).toHaveLength(1);
  });

  it('no answer on a route without a key: nothing can be resent and the target stays blocked', async () => {
    const s = await setUp();
    await s.open('recovery_write_off', writeOff());
    await s.verify();
    await s.press('submit');
    s.consumer.fail({ kind: 'network', status: 0 });
    await s.settle();
    expect(s.text('[data-line="outcome"]')).toContain(
      en.financialAuthorization.outcome.unknownBlocked,
    );
    // Announced once, at once; shown once (no repeated alert box).
    expect(s.text('[data-announce="urgent"]')).toBe(
      en.financialAuthorization.outcome.unknownBlocked,
    );
    expect(s.dialog()?.querySelectorAll('nw-inline-alert')).toHaveLength(0);
    expect(s.issued[0]?.secret.held).toBe(false);
    expect(s.button('repeatIdentical')).toBeNull();
    expect(s.button('startAgain')).toBeNull();
    // A read that shows nothing applied lifts nothing.
    await s.press('reconcile');
    s.reads.ok({ applied: false });
    await s.settle();
    expect(s.button('repeatIdentical')).toBeNull();

    TestBed.inject(Dialog).closeAll();
    await s.open('recovery_write_off', writeOff());
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.blocked,
    );
    expect(s.text('[data-announce="urgent"]')).toBe(
      en.financialAuthorization.authorization.blocked,
    );
    expect(s.codeField()).toBeNull();
    expect(s.issueRequests).toHaveLength(1);
  });

  it('a proving read settles the uncertain outcome as applied', async () => {
    const s = await setUp();
    await s.open('recovery_write_off', writeOff());
    await s.verify();
    await s.press('submit');
    s.consumer.fail({ kind: 'network', status: 0 });
    await s.settle();
    await s.press('reconcile');
    s.reads.ok({ applied: true, result: 'written off' });
    await s.settle();
    expect(s.text('[data-line="outcome"]')).toContain(
      en.financialAuthorization.outcome.appliedByCheck,
    );
  });

  it('a refusal by the service is final: nothing applied, the receipt spent', async () => {
    const s = await setUp();
    await s.open('refund', refund());
    await s.verify();
    await s.press('submit');
    s.consumer.fail({ kind: 'conflict', code: 'refund_authorization_invalid', status: 409 });
    await s.settle();
    expect(s.text('[data-line="outcome"]')).toContain(en.financialAuthorization.outcome.refused);
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.spent,
    );
    expect(s.issued[0]?.secret.held).toBe(false);
    expect(s.dialog()?.querySelectorAll('button[data-action]')).toHaveLength(0);
  });

  it('issuance that changed nothing asks for a new code', async () => {
    const s = await setUp({ scenario: 'unavailable' });
    await s.open('refund', refund());
    await s.verify();
    expect(s.issued).toHaveLength(0);
    expect(s.codeField()?.value).toBe('');
    expect(s.text()).toContain(en.financialAuthorization.authorization.askedAgain);
    expect(document.activeElement).toBe(s.codeField());
  });

  it('a lost issuance answer is asked again once with the same request', async () => {
    const s = await setUp({ scenario: 'outcomeUnknown' });
    await s.open('refund', refund());
    await s.verify();
    expect(s.text('[data-line="authorization"]')).toContain(
      en.financialAuthorization.authorization.issueUnknown,
    );
    await s.press('replayIssue');
    expect(s.issueRequests).toHaveLength(2);
    expect(s.issueRequests[1]?.idempotencyKey).toBe(s.issueRequests[0]?.idempotencyKey);
    expect(s.issueRequests[1]?.stepUp).toBe(s.issueRequests[0]?.stepUp);
    expect(s.button('replayIssue')).toBeNull();
  });

  it.each([
    ['fr', fr],
    ['ar', ar],
  ] as const)('speaks %s; machine values stay left to right', async (lang, catalog) => {
    const s = await setUp({ lang });
    await s.open('refund', refund());
    expect(s.text('h2')).toBe(catalog.financialAuthorization.operations.refund);
    expect(s.text('[data-line="outcome"]')).toContain(
      catalog.financialAuthorization.outcome.notSubmitted,
    );
    expect(s.codeField()?.getAttribute('dir')).toBe('ltr');
    expect(s.dialog()?.querySelector('code')?.getAttribute('dir')).toBe('ltr');
  });
});
