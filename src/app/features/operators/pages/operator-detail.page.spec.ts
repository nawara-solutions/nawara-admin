import en from '../../../../i18n/en.json';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { OperatorDetailPage } from './operator-detail.page';
import {
  DRIVE,
  SCHOOL,
  operatorOf,
  owner,
  renderOperators,
  text,
} from '../testing/operators-testing';

const t = en.operators;
const ID = DEMO_OPERATOR_IDS;

describe('OperatorDetailPage (P6-S1, read only)', { timeout: 15_000 }, () => {
  const render = (id: string, options?: Parameters<typeof renderOperators>[4]) =>
    renderOperators(OperatorDetailPage, owner, DEMO_OWNER_ID, `/operators/${id}`, options);

  const current = (element: HTMLElement) =>
    [...element.querySelectorAll('[data-assignment="active"] .operator-detail__platform bdi')].map(
      (e) => text(e),
    );
  const removed = (element: HTMLElement) =>
    [...element.querySelectorAll('[data-assignment="removed"] .operator-detail__platform bdi')].map(
      (e) => text(e),
    );

  it('shows the operator, current access and removed access apart, with dates', async () => {
    const { element } = await render(ID.phone);
    expect(text(element.querySelector('h1'))).toBe('+99900000001');
    expect(element.querySelector('h1 bdi')?.getAttribute('dir')).toBe('ltr');
    // Drive was removed, then given again: one current record, one removed.
    expect(current(element)).toEqual(['Nawara Drive']);
    expect(removed(element)).toEqual(['Nawara Drive']);
    const removedItem = element.querySelector('[data-assignment="removed"]');
    expect(text(removedItem)).toContain('Given on');
    expect(text(removedItem)).toContain('Removed on');
    expect(text(element.querySelector('[data-assignment="active"]'))).not.toContain('Removed on');
    expect(text(element.querySelector('.operator-detail__note'))).toBe(t.detail.byOwner);
    expect(text(element.querySelector('.operator-detail__rows'))).toContain(t.detail.account.phone);
  });

  it('shows every current Platform of an operator with several', async () => {
    const { element } = await render(ID.multi);
    expect(current(element).sort()).toEqual(['Nawara Drive', 'Nawara School']);
    expect(removed(element)).toEqual([]);
    expect(text(element.querySelector('[data-empty="removed"]'))).toBe(t.detail.removed.none);
    const links = [
      ...element.querySelectorAll<HTMLAnchorElement>('[data-assignment="active"] a'),
    ].map((a) => a.getAttribute('href'));
    expect(links.sort()).toEqual([`/platforms/${DRIVE}`, `/platforms/${SCHOOL}`].sort());
  });

  it('says when an operator has no current access, and shows the blocked and unconfirmed states as demo data', async () => {
    const unassigned = await render(ID.unassigned);
    expect(current(unassigned.element)).toEqual([]);
    expect(text(unassigned.element.querySelector('[data-empty="current"]'))).toBe(
      t.detail.current.none,
    );
    expect(removed(unassigned.element)).toEqual(['Nawara School']);
  });

  it('shows a blocked operator as blocked, keeping what Core keeps', async () => {
    const { element } = await render(ID.blocked);
    expect(text(element.querySelector('.operator-detail__badges'))).toBe(t.state.blocked);
    expect(text(element.querySelector('[data-empty="current"]'))).toBe(
      t.detail.current.noneBlocked,
    );
    expect(element.textContent).toContain(t.detail.stateDescription.blocked);
    expect(text(element.querySelector('.operator-detail__notice'))).toBe(
      t.detail.account.provisional,
    );
  });

  it('lists the changes still to come as information only; the only controls are Platform access (P6-S2)', async () => {
    const { element } = await render(ID.awaitingConfirmation);
    expect(text(element.querySelector('.operator-detail__badges'))).toBe(
      t.state.awaitingConfirmation,
    );
    const later = [...element.querySelectorAll('.operator-detail__later li')].map((li) => text(li));
    expect(later).toEqual([t.detail.later.block, t.detail.later.create, t.detail.later.resend]);
    expect([...element.querySelectorAll('button')].map((b) => text(b))).toEqual([
      t.access.give,
      t.access.remove,
    ]);
    expect([...element.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual([
      '/operators',
      `/platforms/${SCHOOL}`,
    ]);
  });

  it('collapses an unknown operator into "not found", and never asks for its history', async () => {
    const { element, historySpy } = await render('3c1d0000-0000-4000-8000-000000000000');
    expect(text(element.querySelector('h1'))).toBe(t.states.notFoundTitle);
    expect(historySpy).not.toHaveBeenCalled();
    expect(element.textContent).not.toContain('@demo.nawara.invalid');
  });

  it('collapses the owner’s own id (not an operator) the same way', async () => {
    const { element } = await render(DEMO_OWNER_ID);
    expect(text(element.querySelector('h1'))).toBe(t.states.notFoundTitle);
  });

  it('shows an operator nothing and requests nothing, even their own page', async () => {
    const { element, loadSpy, historySpy } = await renderOperators(
      OperatorDetailPage,
      operatorOf(ID.school),
      ID.school,
      `/operators/${ID.school}`,
    );
    expect(loadSpy).not.toHaveBeenCalled();
    expect(historySpy).not.toHaveBeenCalled();
    expect(element.textContent).not.toContain('operator.school@demo.nawara.invalid');
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.forbiddenDescription);
  });

  it('keeps the account when the history is not available in the build', async () => {
    const { element } = await render(ID.multi, { history: 'unavailable' });
    expect(text(element.querySelector('h1'))).toBe('operator.multi@demo.nawara.invalid');
    expect(element.textContent).toContain(t.detail.history.notInBuild);
    expect(current(element)).toEqual([]);
  });

  it('says the operator page is not available in a build without demo data', async () => {
    const { element, historySpy } = await render(ID.multi, {
      directory: 'unavailable',
      history: 'unavailable',
    });
    expect(text(element.querySelector('h1'))).toBe(t.states.notInBuildTitle);
    expect(historySpy).not.toHaveBeenCalled();
  });
});
