import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import en from '../../../../i18n/en.json';
import { DemoWorld } from '../../../demo/world/demo-world';
import { AdminIdentityId } from '../../../demo/world/records';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { platformViewerOf } from '../../../demo/world/selectors';
import { NwToastService } from '../../../shared/ui/toast/toast.service';
import { OperatorBlockAction } from '../application/operator-block.action';
import { OperatorAccountDemoScenario } from '../data-access/operator.mock';
import { SCHOOL, operatorOf, owner, renderOperators, text } from '../testing/operators-testing';
import { OperatorDetailPage } from './operator-detail.page';

const A = en.operators.account;
const ID = DEMO_OPERATOR_IDS;

async function setUp(operator: AdminIdentityId, account: OperatorAccountDemoScenario = 'normal') {
  const rendered = await renderOperators(
    OperatorDetailPage,
    owner,
    DEMO_OWNER_ID,
    `/operators/${operator}`,
    {
      account,
    },
  );
  const { element, settle } = rendered;
  for (let i = 0; i < 20 && !element.querySelector('[data-account-action]'); i++) await settle(10);
  const dialog = () => document.querySelector<HTMLElement>('adm-operator-block-dialog');
  const press = async (selector: string) => {
    const b = dialog()?.querySelector<HTMLButtonElement>(selector);
    if (!b) throw new Error(`no ${selector}`);
    b.click();
    await settle(40);
  };
  const open = async () => {
    element.querySelector<HTMLButtonElement>('[data-account-action]')!.click();
    await settle(20);
  };
  return {
    ...rendered,
    world: TestBed.inject(DemoWorld),
    dialog,
    press,
    open,
    role: () => document.querySelector('.cdk-dialog-container')?.getAttribute('role') ?? null,
    toasts: vi.spyOn(TestBed.inject(NwToastService), 'show'),
    blocked: () =>
      TestBed.inject(DemoWorld)
        .snapshot()
        .operators.find((o) => o.id === operator)?.blocked,
  };
}

describe('Operator block and unblock (P6-S3)', { timeout: 15_000 }, () => {
  afterEach(() => TestBed.inject(Dialog).closeAll());

  it('blocks from an alertdialog with focus on Cancel; the assignments stay, shown as ineffective', async () => {
    const s = await setUp(ID.school);
    expect(
      s.element.querySelector('[data-account-action]')?.getAttribute('data-account-action'),
    ).toBe('block');
    await s.open();
    expect(s.role()).toBe('alertdialog');
    expect(document.activeElement?.hasAttribute('data-cancel')).toBe(true);
    const body = text(s.dialog());
    for (const line of [
      A.blockSessions,
      A.blockCodes,
      A.blockPlatforms,
      A.blockUnblockLater,
      A.noStepUp,
    ])
      expect(body).toContain(line);
    // A confirmed operator gets no confirmation warning; nothing asks for a verification.
    expect(s.dialog()?.querySelector('[data-warning="unconfirmed"]')).toBeNull();
    expect(s.dialog()?.querySelector('input')).toBeNull();
    await s.press('button[data-confirm]');
    expect(s.blockSpy).toHaveBeenCalledTimes(1);
    expect(s.dialog()).toBeNull();
    await s.settle(40);
    expect(s.blocked()).toBe(true);
    expect(text(s.element.querySelector('[data-blocked-banner]'))).toBe(A.blockedBanner);
    expect(text(s.element.querySelector('#operator-current'))).toBe(A.keptTitle);
    expect(text(s.element.querySelector('[data-ineffective]'))).toBe(A.inactiveWhileBlocked);
    // Removing access stays possible for the owner while blocked (D5).
    expect(s.element.querySelector('[data-remove-access]')).not.toBeNull();
    expect(
      s.element.querySelector('[data-account-action]')?.getAttribute('data-account-action'),
    ).toBe('unblock');
    expect(platformViewerOf(s.world.snapshot(), ID.school, SCHOOL)).toBeNull();
    const [message] = s.toasts.mock.calls.at(-1)!;
    expect(message).toBe(A.blocked);
    expect(message).not.toContain('@');
    expect(document.activeElement?.id).toBe('operator-account');
  });

  it('warns before blocking an unconfirmed operator (CF-16) and offers no resend anywhere', async () => {
    const s = await setUp(ID.awaitingConfirmation);
    await s.open();
    const warning = s.dialog()?.querySelector('[data-warning="unconfirmed"]');
    expect(text(warning)).toBe(`${A.unconfirmedTitle} ${A.unconfirmedBody}`);
    const labels = [...document.querySelectorAll('button')].map((b) => text(b));
    expect(labels.some((l) => /resend|send a new/i.test(l))).toBe(false);
  });

  it('unblocks from a dialog that says what comes back and what does not', async () => {
    const s = await setUp(ID.blocked);
    expect(
      s.element.querySelector('[data-account-action]')?.getAttribute('data-account-action'),
    ).toBe('unblock');
    await s.open();
    expect(s.role()).toBe('dialog');
    const body = text(s.dialog());
    for (const line of [A.unblockSignIn, A.unblockPlatforms, A.unblockNothingElse])
      expect(body).toContain(line);
    await s.press('button[data-confirm]');
    expect(s.unblockSpy).toHaveBeenCalledTimes(1);
    await s.settle(40);
    expect(s.blocked()).toBe(false);
    expect(s.element.querySelector('[data-blocked-banner]')).toBeNull();
  });

  it('after a lost answer reloads the demo state, says Core cannot re-read it, and repeats only on request', async () => {
    const s = await setUp(ID.school, 'outcomeUnknown');
    await s.open();
    await s.press('button[data-confirm]');
    await s.settle(60);
    expect(text(s.dialog()?.querySelector('nw-inline-alert'))).toBe(A.failure.unknown);
    expect(text(s.dialog()?.querySelector('[data-reconciliation]'))).toBe(A.nowBlocked);
    expect(text(s.dialog()?.querySelector('[data-core-note]'))).toBe(A.coreCannotReread);
    expect(text(s.dialog()?.querySelector('[data-repeat-warning]'))).toBe(A.repeatWarning);
    await s.settle(100);
    expect(s.blockSpy).toHaveBeenCalledTimes(1);
    const repeat = s.dialog()?.querySelector<HTMLButtonElement>('button[data-repeat]');
    expect(text(repeat)).toBe(A.blockAgain);
    repeat!.click();
    await s.settle(60);
    expect(s.blockSpy).toHaveBeenCalledTimes(2);
  });

  it('after a 500 never claims a failure: reloads and shows the account unchanged, with Try again', async () => {
    const s = await setUp(ID.school, 'auditFailure');
    await s.open();
    await s.press('button[data-confirm]');
    await s.settle(60);
    expect(text(s.dialog()?.querySelector('nw-inline-alert'))).toBe(A.failure.unknown);
    expect(text(s.dialog()?.querySelector('[data-reconciliation]'))).toBe(A.stillActive);
    expect(text(s.dialog()?.querySelector('button[data-repeat]'))).toBe(en.actions.retry);
    expect(s.blocked()).toBe(false);
    expect(s.blockSpy).toHaveBeenCalledTimes(1);
  });

  it('never offers or opens the account controls for an operator', async () => {
    const s = await renderOperators(
      OperatorDetailPage,
      operatorOf(ID.school),
      ID.school,
      `/operators/${ID.school}`,
    );
    expect(s.element.querySelector('[data-account-action]')).toBeNull();
    const action = TestBed.inject(OperatorBlockAction);
    expect(action.offered()).toBe(false);
    action.open(
      {
        id: ID.school,
        contact: { kind: 'email', email: 'x@x.invalid' },
        accountState: 'canSignIn',
        activePlatformIds: [SCHOOL],
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      1,
    );
    await s.settle();
    expect(document.querySelector('adm-operator-block-dialog')).toBeNull();
    expect(s.blockSpy).not.toHaveBeenCalled();
  });
});
