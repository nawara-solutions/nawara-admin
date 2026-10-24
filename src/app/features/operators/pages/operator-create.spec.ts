import { Dialog } from '@angular/cdk/dialog';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import en from '../../../../i18n/en.json';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { createOperator, createdOperatorId } from '../../../demo/world/commands/operator.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID, demoWorldSeed } from '../../../demo/world/seed';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { CREATED_OPERATOR_STATE } from '../application/operator-create.action';
import { OperatorAccountDemoScenario } from '../data-access/operator.mock';
import {
  RenderOptions,
  operatorOf,
  owner,
  renderOperators,
  text,
} from '../testing/operators-testing';
import { OperatorDetailPage } from './operator-detail.page';
import { OperatorDirectoryPage } from './operator-directory.page';

const C = en.operators.create;
const NOW = Date.parse('2026-10-23T12:00:00Z');

async function setUp(options: RenderOptions = {}) {
  const rendered = await renderOperators(
    OperatorDirectoryPage,
    owner,
    DEMO_OWNER_ID,
    '/operators',
    options,
  );
  const { element, settle } = rendered;
  for (let i = 0; i < 20 && !element.querySelector('adm-operator-list'); i++) await settle(10);
  const dialog = () => document.querySelector<HTMLElement>('adm-operator-create-dialog');
  const input = (name: string) =>
    dialog()!.querySelector<HTMLInputElement>(`input[name="${name}"]`);
  const type = async (name: string, value: string) => {
    const field = input(name)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    await settle();
  };
  const submit = async (id: string) => {
    dialog()!.querySelector<HTMLFormElement>(`form#${id}`)!.requestSubmit();
    await settle(30);
  };
  const open = async () => {
    element.querySelector<HTMLButtonElement>('[data-create-operator]')!.click();
    await settle(20);
  };
  /** The form, then the verification with the demo step-up code. */
  const create = async (contact: string, kind: 'email' | 'phone' = 'email') => {
    await open();
    if (kind === 'phone') {
      dialog()!.querySelector<HTMLInputElement>('input[value="phone"]')!.click();
      await settle();
    }
    await type('operator-contact', contact);
    await submit('operator-create-form');
    await type('step-up-code', '123456');
    await submit('operator-create-verify');
    await settle(40);
  };
  return {
    ...rendered,
    world: TestBed.inject(DemoWorld),
    auth: TestBed.inject(DemoAuthState),
    toasts: vi.spyOn(TestBed.inject(NwToastService), 'show'),
    dialog,
    input,
    type,
    submit,
    open,
    create,
    button: (selector: string) => dialog()?.querySelector<HTMLButtonElement>(selector) ?? null,
  };
}

const scenario = (account: OperatorAccountDemoScenario) => ({ account });

describe('Create an operator (P6-S4)', { timeout: 20_000 }, () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('is offered to the owner only, and never in a build without the mock', async () => {
    const s = await setUp();
    expect(text(s.element.querySelector('[data-create-operator]'))).toBe(C.open);
    TestBed.resetTestingModule();
    const none = await renderOperators(OperatorDirectoryPage, owner, DEMO_OWNER_ID, '/operators', {
      directory: 'unavailable',
      accountGateway: 'unavailable',
    });
    expect(none.element.querySelector('[data-create-operator]')).toBeNull();
    TestBed.resetTestingModule();
    const op = DEMO_OPERATOR_IDS.multi;
    const asOperator = await renderOperators(
      OperatorDirectoryPage,
      operatorOf(op),
      op,
      '/operators',
    );
    expect(asOperator.element.querySelector('[data-create-operator]')).toBeNull();
  });

  it('checks the one contact before anything is sent, and switching kind clears the value', async () => {
    const s = await setUp();
    await s.open();
    expect(document.activeElement).toBe(s.input('operator-contact'));
    await s.submit('operator-create-form');
    expect(text(s.dialog())).toContain(C.emailRequired);
    expect(s.input('operator-contact')?.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(s.input('operator-contact'));
    await s.type('operator-contact', '+33 6 12 34 56 78');
    await s.submit('operator-create-form');
    expect(text(s.dialog())).toContain(C.emailInvalid);
    // Phone chosen: the email text is gone, never kept to be sent along.
    s.dialog()!.querySelector<HTMLInputElement>('input[value="phone"]')!.click();
    await s.settle();
    expect(s.input('operator-contact')?.value).toBe('');
    expect(s.input('operator-contact')?.type).toBe('tel');
    await s.type('operator-contact', 'someone@demo.nawara.invalid');
    await s.submit('operator-create-form');
    expect(text(s.dialog())).toContain(C.phoneInvalid);
    expect(s.createSpy).not.toHaveBeenCalled();
    expect(s.input('step-up-code')).toBeNull();
  });

  it('creates with the normalized contact after verification, then opens the operator with next steps', async () => {
    const s = await setUp();
    const before = s.world.snapshot().operators.length;
    await s.open();
    await s.type('operator-contact', '  New.Operator@Demo.Nawara.INVALID ');
    await s.submit('operator-create-form');
    expect(text(s.dialog())).toContain(`${C.purpose} new.operator@demo.nawara.invalid`);
    expect(s.createSpy).not.toHaveBeenCalled();
    await s.type('step-up-code', '123456');
    await s.submit('operator-create-verify');
    await s.settle(40);
    expect(s.createSpy).toHaveBeenCalledTimes(1);
    expect(s.createSpy.mock.calls[0]?.[0]).toEqual({
      kind: 'email',
      email: 'new.operator@demo.nawara.invalid',
    });
    const operators = s.world.snapshot().operators;
    expect(operators.length).toBe(before + 1);
    const created = operators.at(-1)!;
    expect(s.dialog()).toBeNull();
    expect(s.router.url).toBe(`/operators/${created.id}`);
    expect(TestBed.inject(Location).getState()).toMatchObject({
      [CREATED_OPERATOR_STATE]: created.id,
    });
    // The toast never carries the contact.
    expect(s.toasts).toHaveBeenCalledWith(C.created, { tone: 'success' });
    expect(JSON.stringify(s.toasts.mock.calls)).not.toContain('new.operator');
    // Contacts never go into a URL.
    expect(s.router.url).not.toContain('@');
  });

  it('creates a phone operator from a formatted number', async () => {
    const s = await setUp();
    await s.create('+999 (0000) 0099', 'phone');
    expect(s.createSpy.mock.calls[0]?.[0]).toEqual({ kind: 'phone', phone: '+99900000099' });
    expect(s.world.snapshot().operators.at(-1)).toMatchObject({
      email: null,
      phone: '+99900000099',
    });
  });

  it('sends one creation however often the verification is pressed', async () => {
    const s = await setUp({ latency: 60 });
    await s.open();
    await s.type('operator-contact', 'once@demo.nawara.invalid');
    await s.submit('operator-create-form');
    await s.settle(80);
    await s.type('step-up-code', '123456');
    const verify = s.dialog()!.querySelector<HTMLFormElement>('form#operator-create-verify')!;
    verify.requestSubmit();
    verify.requestSubmit();
    s.button('button[type="submit"]')?.click();
    await s.settle(400);
    expect(s.createSpy).toHaveBeenCalledTimes(1);
    expect(
      s.world.snapshot().operators.filter((o) => o.email === 'once@demo.nawara.invalid').length,
    ).toBe(1);
  });

  it('a wrong verification code sends nothing', async () => {
    const s = await setUp();
    await s.open();
    await s.type('operator-contact', 'wrong.code@demo.nawara.invalid');
    await s.submit('operator-create-form');
    await s.type('step-up-code', '000000');
    await s.submit('operator-create-verify');
    expect(text(s.dialog())).toContain(en.actions.failure.verificationRefused);
    expect(s.createSpy).not.toHaveBeenCalled();
  });

  it('a taken contact brings the form back saying only that it is taken', async () => {
    const s = await setUp();
    const before = s.world.snapshot();
    await s.create('member@demo.nawara.invalid');
    expect(s.createSpy).toHaveBeenCalledTimes(1);
    expect(s.world.snapshot()).toBe(before);
    const alert = s.dialog()!.querySelector('nw-inline-alert');
    expect(text(alert)).toBe(C.failure.duplicate);
    // Never which kind of account holds it.
    for (const kind of ['member', 'owner']) expect(text(alert).toLowerCase()).not.toContain(kind);
    expect(s.input('operator-contact')?.getAttribute('aria-invalid')).toBe('true');
    expect(s.input('operator-contact')?.value).toBe('member@demo.nawara.invalid');
    expect(text(s.button('[data-submit]'))).toBe(C.submitAnother);
    // Another contact: verified again, then created.
    await s.type('operator-contact', 'another@demo.nawara.invalid');
    await s.submit('operator-create-form');
    expect(s.input('step-up-code')).not.toBeNull();
  });

  it('a lost answer: the list is read again and the operator found, without resending or claiming it', async () => {
    const s = await setUp(scenario('outcomeUnknown'));
    await s.create('lost.found@demo.nawara.invalid');
    await s.settle(40);
    const body = text(s.dialog());
    expect(body).toContain(C.failure.unknown);
    expect(body).toContain(C.found);
    expect(body).toContain(C.foundCaveat);
    expect(body).toContain(C.coreCannotLookUp);
    expect(s.button('[data-retry]')).toBeNull();
    expect(s.createSpy).toHaveBeenCalledTimes(1);
    const created = s.world
      .snapshot()
      .operators.find((o) => o.email === 'lost.found@demo.nawara.invalid')!;
    s.button('[data-open-found]')!.click();
    await s.settle(20);
    expect(s.router.url).toBe(`/operators/${created.id}`);
    expect(s.dialog()).toBeNull();
  });

  it('a lost answer with nothing found: still uncertain; a new attempt is explicit and verifies again', async () => {
    // Core's audit-failure 500 rolls back, but Admin cannot tell that 500 from a lost answer.
    const s = await setUp(scenario('auditFailure'));
    await s.create('lost.none@demo.nawara.invalid');
    await s.settle(40);
    expect(text(s.dialog())).toContain(C.notFound);
    expect(s.createSpy).toHaveBeenCalledTimes(1);
    s.button('[data-retry]')!.click();
    await s.settle(20);
    expect(s.input('step-up-code')).not.toBeNull();
    expect(s.createSpy).toHaveBeenCalledTimes(1);
  });

  it('an unavailable service: nothing created, an explicit retry verifies again', async () => {
    const s = await setUp(scenario('unavailable'));
    await s.create('later@demo.nawara.invalid');
    expect(text(s.dialog())).toContain(C.failure.unavailable);
    expect(s.dialog()?.querySelector('[data-reconciliation]')).toBeNull();
    s.button('[data-retry]')!.click();
    await s.settle(20);
    expect(s.input('step-up-code')).not.toBeNull();
  });
});

describe('A just-created operator’s page (P6-S4)', { timeout: 15_000 }, () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  async function created(state: boolean) {
    let id = '';
    const seed = (now: number) => {
      const outcome = createOperator({
        actor: DEMO_OWNER_ID,
        contact: { kind: 'email', email: 'fresh@demo.nawara.invalid' },
        reservedContacts: new Set(),
        now,
      })(demoWorldSeed(now));
      if (!outcome.ok) throw new Error('not created');
      id = outcome.result.id;
      return outcome.world;
    };
    const created = createdOperatorId(demoWorldSeed(NOW).sequence + 1);
    const rendered = await renderOperators(
      OperatorDetailPage,
      owner,
      DEMO_OWNER_ID,
      `/operators/${created}`,
      state ? { seed, state: { [CREATED_OPERATOR_STATE]: created } } : { seed },
    );
    expect(id).toBe(created);
    const { element, settle } = rendered;
    for (let i = 0; i < 30 && !element.querySelector('[data-empty="current"]'); i++)
      await settle(10);
    return element;
  }

  it('shows the next steps, the unconfirmed state and no Platform access', async () => {
    const element = await created(true);
    const next = element.querySelector('[data-created-next-steps]');
    expect(text(next)).toContain(C.nextTitle);
    for (const line of [C.nextCode, C.nextConfirm, C.nextAccess, C.nextNoResend, C.nextDemo])
      expect(text(next)).toContain(line);
    expect(text(element.querySelector('.operator-detail__badges'))).toBe(
      en.operators.state.awaitingConfirmation,
    );
    expect(text(element.querySelector('[data-empty="current"]'))).toBe(
      en.operators.detail.current.none,
    );
    expect(element.querySelector('[data-give-access]')).not.toBeNull();
    // Never the code.
    expect(text(element)).not.toContain('005318');
  });

  it('shows no next steps when the page is opened any other way', async () => {
    const element = await created(false);
    expect(element.querySelector('[data-created-next-steps]')).toBeNull();
  });
});
