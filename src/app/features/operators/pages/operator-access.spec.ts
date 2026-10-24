import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import en from '../../../../i18n/en.json';
import { ScopeContext } from '../../../core/context/scope-context';
import { revokePlatformAssignment } from '../../../demo/world/commands/operator.commands';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { grantsOf, platformViewerOf } from '../../../demo/world/selectors';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { PlatformAccessAction } from '../application/platform-access.action';
import { OperatorAssignmentDemoScenario } from '../data-access/operator.mock';
import {
  DRIVE,
  SCHOOL,
  operatorOf,
  owner,
  renderOperators,
  text,
} from '../testing/operators-testing';
import { OperatorDetailPage } from './operator-detail.page';

const A = en.operators.access;
const ID = DEMO_OPERATOR_IDS;
const strip = (s: string) => s.replace(/[⁨⁩]/g, '');
const fill = (template: string, name: string) => template.replace('{{name}}', name);

async function setUp(
  operator: AdminIdentityId,
  {
    changes = 'normal' as OperatorAssignmentDemoScenario,
    before = (): unknown => undefined,
  }: { changes?: OperatorAssignmentDemoScenario; before?: () => unknown } = {},
) {
  const rendered = await renderOperators(
    OperatorDetailPage,
    owner,
    DEMO_OWNER_ID,
    `/operators/${operator}`,
    { changes },
  );
  before();
  const { element, settle } = rendered;
  for (
    let i = 0;
    i < 20 && !element.querySelector('[data-assignment], [data-empty="current"]');
    i++
  )
    await settle(10);
  const world = TestBed.inject(DemoWorld);
  const dialog = () => document.querySelector<HTMLElement>('adm-platform-access-dialog');
  const button = (label: string) =>
    [...(dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) =>
      text(b).startsWith(label),
    ) ?? null;
  const press = async (label: string) => {
    const b = button(label);
    if (!b) throw new Error(`no button ${label}`);
    b.click();
    await settle(20);
  };
  const verify = async (code: string) => {
    const input = dialog()!.querySelector<HTMLInputElement>('input[name="step-up-code"]')!;
    input.value = code;
    input.dispatchEvent(new Event('input'));
    await settle();
    dialog()!.querySelector<HTMLFormElement>('form')!.requestSubmit();
    await settle(30);
  };
  const give = () => element.querySelector<HTMLButtonElement>('[data-give-access]');
  const removeFor = (platform: string) =>
    element.querySelector<HTMLButtonElement>(`[data-remove-access][data-platform="${platform}"]`);
  const current = () =>
    [...element.querySelectorAll('[data-assignment="active"] .operator-detail__platform bdi')].map(
      (e) => text(e),
    );
  const removed = () =>
    [...element.querySelectorAll('[data-assignment="removed"] .operator-detail__platform bdi')].map(
      (e) => text(e),
    );
  return {
    ...rendered,
    world,
    dialog,
    role: () => document.querySelector('.cdk-dialog-container')?.getAttribute('role') ?? null,
    button,
    press,
    verify,
    give,
    removeFor,
    current,
    removed,
    toasts: vi.spyOn(TestBed.inject(NwToastService), 'show'),
    revision: TestBed.inject(ScopeContext).revision,
    status: () => strip(text(dialog()?.querySelector('[data-reconciliation]'))),
  };
}

describe('Platform access: give and remove (P6-S2)', { timeout: 15_000 }, () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('gives a Company Platform the operator lacks: choose, verify, then the new record is current', async () => {
    const s = await setUp(ID.unassigned);
    expect(s.current()).toEqual([]);
    s.give()!.click();
    await s.settle();
    expect(s.role()).toBe('dialog');
    const radios = [...s.dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => [r.value, r.disabled])).toEqual([
      [SCHOOL, false],
      [DRIVE, false],
    ]);
    expect(document.activeElement).toBe(radios[0]);
    radios[1]!.click();
    radios[1]!.dispatchEvent(new Event('change'));
    await s.settle();
    expect(strip(text(s.dialog()))).toContain(A.grantNotMembership);
    await s.press(A.continue);
    expect(strip(text(s.dialog()?.querySelector('.platform-access__purpose')))).toContain(
      `${fill(A.grantPurpose, 'Nawara Drive')} operator.unassigned@demo.nawara.invalid`,
    );
    const before = s.revision();
    await s.verify('123456');
    expect(s.grantSpy).toHaveBeenCalledTimes(1);
    expect(s.grantSpy.mock.calls[0]?.slice(0, 2)).toEqual([ID.unassigned, DRIVE]);
    expect(s.dialog()).toBeNull();
    await s.settle(30);
    expect(s.current()).toEqual(['Nawara Drive']);
    // The earlier removed School record stays in the history.
    expect(s.removed()).toEqual(['Nawara School']);
    expect(s.revision()).toBeGreaterThan(before);
    const [message] = s.toasts.mock.calls.at(-1)!;
    expect(strip(message)).toBe(fill(A.granted, 'Nawara Drive'));
    expect(message).not.toContain('@');
    expect(document.activeElement?.id).toBe('operator-current');
  });

  it('refuses to open when every Platform is already assigned, and says why', async () => {
    const s = await setUp(ID.multi);
    expect(s.give()!.getAttribute('aria-disabled')).toBe('true');
    expect(s.give()!.getAttribute('aria-describedby')).toBe('operator-give-reason');
    expect(text(s.element.querySelector('#operator-give-reason'))).toBe(A.nothingLeft);
    s.give()!.click();
    await s.settle();
    expect(s.dialog()).toBeNull();
  });

  it('shows the Platforms already assigned as disabled choices', async () => {
    const school = await setUp(ID.school);
    school.give()!.click();
    await school.settle();
    const radios = [...school.dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => r.disabled)).toEqual([true, false]);
    expect(text(school.dialog()!.querySelector('.platform-access__choice-note'))).toBe(
      A.alreadyAssigned,
    );
  });

  it('removes from an alertdialog with focus on Cancel, warns about the only Platform, and keeps the history', async () => {
    const s = await setUp(ID.phone);
    s.removeFor(DRIVE)!.click();
    await s.settle(20);
    expect(s.role()).toBe('alertdialog');
    expect(document.activeElement?.hasAttribute('data-cancel')).toBe(true);
    expect(
      strip(text(s.dialog()?.querySelector('h2, [role="heading"], .nw-dialog__title'))),
    ).toContain(fill(A.removeTitle, 'Nawara Drive'));
    expect(strip(text(s.dialog()))).toContain('+99900000001');
    expect(s.dialog()!.querySelector('[data-warning="only-platform"]')).not.toBeNull();
    // Multi is listed on Drive too: no "last listed" warning.
    expect(s.dialog()!.querySelector('[data-warning="last-listed"]')).toBeNull();
    await s.press(A.continueRemove);
    await s.verify('123456');
    expect(s.revokeSpy).toHaveBeenCalledTimes(1);
    await s.settle(30);
    expect(s.current()).toEqual([]);
    expect(s.removed()).toEqual(['Nawara Drive', 'Nawara Drive']);
    expect(platformViewerOf(s.world.snapshot(), ID.phone, DRIVE)).toBeNull();
    expect(strip(s.toasts.mock.calls.at(-1)![0])).toBe(fill(A.removed, 'Nawara Drive'));
  });

  it('warns, without blocking, when no other operator is listed for the Platform', async () => {
    const s = await setUp(ID.phone, {
      before: () =>
        TestBed.inject(DemoWorld).commit(
          revokePlatformAssignment({
            actor: DEMO_OWNER_ID,
            operatorId: ID.multi,
            platformId: DRIVE,
            now: Date.parse('2026-10-23T12:00:00Z'),
          }),
        ),
    });
    s.removeFor(DRIVE)!.click();
    await s.settle(30);
    expect(s.dialog()!.querySelector('[data-warning="last-listed"]')).not.toBeNull();
    await s.press(A.continueRemove);
    await s.verify('123456');
    expect(s.revokeSpy).toHaveBeenCalledTimes(1);
    expect(grantsOf(s.world.snapshot(), ID.phone).platformAssignments).toEqual([]);
  });

  it('keeps a refused code in verification, sends nothing, and Cancel sends nothing either', async () => {
    const s = await setUp(ID.school);
    s.removeFor(SCHOOL)!.click();
    await s.settle(20);
    await s.press(A.continueRemove);
    await s.verify('000000');
    expect(s.dialog()?.querySelector('input[name="step-up-code"]')).not.toBeNull();
    expect(s.revokeSpy).not.toHaveBeenCalled();
    await s.press(en.actions.stepUp.back);
    await s.press(en.common.cancel);
    expect(s.dialog()).toBeNull();
    expect(s.revokeSpy).not.toHaveBeenCalled();
    expect(s.current()).toEqual(['Nawara School']);
  });

  it('after a lost answer reloads the history, says what it shows, and never resends', async () => {
    const s = await setUp(ID.unassigned, { changes: 'outcomeUnknown' });
    s.give()!.click();
    await s.settle();
    await s.press(A.continue);
    await s.verify('123456');
    await s.settle(40);
    expect(strip(text(s.dialog()?.querySelector('nw-inline-alert')))).toBe(A.failure.unknown);
    expect(s.status()).toBe(fill(A.nowAssigned, 'Nawara School'));
    // The reload shows the change applied: no "Try again", only "Check again", and nothing was sent twice.
    expect(s.button(en.actions.retry)).toBeNull();
    expect(s.button(A.checkAgain)).not.toBeNull();
    await s.settle(60);
    expect(s.grantSpy).toHaveBeenCalledTimes(1);
  });

  it('after a 409 says the Platform is assigned without claiming this attempt did it', async () => {
    const s = await setUp(ID.unassigned, { changes: 'changedElsewhere' });
    s.give()!.click();
    await s.settle();
    await s.press(A.continue);
    await s.verify('123456');
    await s.settle(40);
    expect(strip(text(s.dialog()?.querySelector('nw-inline-alert')))).toBe(A.failure.conflict);
    expect(s.status()).toBe(fill(A.nowAssigned, 'Nawara School'));
    expect(s.button(en.actions.retry)).toBeNull();
    expect(s.grantSpy).toHaveBeenCalledTimes(1);
  });

  it('after a repeated removal (404) says it is no longer assigned', async () => {
    const s = await setUp(ID.school, { changes: 'changedElsewhere' });
    s.removeFor(SCHOOL)!.click();
    await s.settle(20);
    await s.press(A.continueRemove);
    await s.verify('123456');
    await s.settle(40);
    expect(strip(text(s.dialog()?.querySelector('nw-inline-alert')))).toBe(A.failure.refused);
    expect(s.status()).toBe(fill(A.nowRemoved, 'Nawara School'));
    expect(s.revokeSpy).toHaveBeenCalledTimes(1);
  });

  it('after hierarchy_unavailable shows the old state and offers a NEW verification, never a resend', async () => {
    const s = await setUp(ID.unassigned, { changes: 'hierarchyUnavailable' });
    s.give()!.click();
    await s.settle();
    await s.press(A.continue);
    await s.verify('123456');
    await s.settle(40);
    expect(strip(text(s.dialog()?.querySelector('nw-inline-alert')))).toBe(A.failure.unavailable);
    expect(s.status()).toBe(fill(A.stillUnassigned, 'Nawara School'));
    await s.press(en.actions.retry);
    expect(s.dialog()?.querySelector('input[name="step-up-code"]')).not.toBeNull();
    expect(s.grantSpy).toHaveBeenCalledTimes(1);
  });

  it('after throttling offers Try again (a new verification) without reloading', async () => {
    const s = await setUp(ID.school, { changes: 'rateLimited' });
    s.removeFor(SCHOOL)!.click();
    await s.settle(20);
    await s.press(A.continueRemove);
    await s.verify('123456');
    await s.settle(20);
    expect(strip(text(s.dialog()?.querySelector('nw-inline-alert')))).toBe(A.failure.rateLimited);
    expect(s.dialog()?.querySelector('[data-reconciliation]')).toBeNull();
    expect(s.button(en.actions.retry)).not.toBeNull();
  });

  it('never offers or opens the controls for an operator, even with their own id', async () => {
    const s = await renderOperators(
      OperatorDetailPage,
      operatorOf(ID.school),
      ID.school,
      `/operators/${ID.school}`,
    );
    expect(s.element.querySelector('[data-give-access], [data-remove-access]')).toBeNull();
    const action = TestBed.inject(PlatformAccessAction);
    expect(action.offered()).toBe(false);
    action.open({
      operatorId: ID.school,
      contact: { kind: 'email', email: 'x@x.invalid' },
      platform: { id: DRIVE, name: 'Nawara Drive', key: null, product: null },
      grant: true,
    });
    await s.settle();
    expect(document.querySelector('adm-platform-access-dialog')).toBeNull();
    expect(s.grantSpy).not.toHaveBeenCalled();
  });
});
