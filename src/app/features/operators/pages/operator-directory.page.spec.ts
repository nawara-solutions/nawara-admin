import en from '../../../../i18n/en.json';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import { OperatorDirectoryPage } from './operator-directory.page';
import {
  DRIVE,
  SCHOOL,
  operatorOf,
  owner,
  renderOperators,
  text,
} from '../testing/operators-testing';

const t = en.operators;

describe('OperatorDirectoryPage (P6-S1, read only, provisional)', { timeout: 15_000 }, () => {
  const render = (options?: Parameters<typeof renderOperators>[4], url = '/operators') =>
    renderOperators(OperatorDirectoryPage, owner, DEMO_OWNER_ID, url, options);

  const tableRows = (element: HTMLElement) => [
    ...element.querySelectorAll('.operator-list__table tbody tr'),
  ];
  const contacts = (element: HTMLElement) =>
    tableRows(element).map((r) => text(r.querySelector('.operator-list__link')));

  it('lists the Company’s operators with their active Platforms, account state and totals', async () => {
    const { element } = await render();
    expect(text(element.querySelector('h1'))).toBe(t.header.title);
    expect(contacts(element)).toEqual([
      '+99900000001',
      'operator.blocked@demo.nawara.invalid',
      'operator.multi@demo.nawara.invalid',
      'operator.new@demo.nawara.invalid',
      'operator.school@demo.nawara.invalid',
      'operator.unassigned@demo.nawara.invalid',
    ]);
    const totals = [...element.querySelectorAll('.operator-directory__total dd')].map((d) =>
      text(d),
    );
    // 6 operators, 5 active assignments (as on the Platform pages), 2 without access.
    expect(totals).toEqual(['6', '5', '2']);
    const multi = tableRows(element)[2];
    expect(
      [...(multi?.querySelectorAll('.operator-list__pill') ?? [])].map((p) => text(p)),
    ).toEqual(['Nawara School', 'Nawara Drive']);
    const blocked = tableRows(element)[1];
    expect(text(blocked?.querySelector('nw-status-badge'))).toBe(t.state.blocked);
    expect(text(blocked?.querySelector('.operator-list__none'))).toBe(t.list.noPlatform);
    expect(text(tableRows(element)[3]?.querySelector('nw-status-badge'))).toBe(
      t.state.awaitingConfirmation,
    );
    // Says it is provisional demo data, and where the other changes are made.
    expect(text(element.querySelector('.operator-directory__provisional'))).toBe(t.provisional);
    expect(text(element.querySelector('.operator-directory__later'))).toBe(t.later.directory);
    expect(text(element.querySelector('.operators-header__demo'))).toContain(en.shell.demo.badge);
  });

  it('links each operator by id, never by contact; the only change offered here is creating one (P6-S4)', async () => {
    const { element } = await render();
    const hrefs = [
      ...element.querySelectorAll<HTMLAnchorElement>('.operator-list__table .operator-list__link'),
    ].map((a) => a.getAttribute('href') ?? '');
    expect(hrefs).toContain(`/operators/${DEMO_OPERATOR_IDS.multi}`);
    expect(hrefs.every((h) => /^\/operators\/[0-9a-f-]{36}$/.test(h))).toBe(true);
    const buttons = [...element.querySelectorAll('button')].map((b) => text(b));
    expect(buttons.filter((b) => /give|grant|remove|block|create|resend/i.test(b))).toEqual([
      en.operators.create.open,
    ]);
  });

  it('searches by email or phone in the page only: the URL never holds the search', async () => {
    const { element, router, settle } = await render();
    const input = element.querySelector<HTMLInputElement>('input[type="search"]');
    if (!input) throw new Error('no search');
    expect(input.getAttribute('aria-controls')).toBe('operator-directory-list');
    input.value = 'MULTI';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(contacts(element)).toEqual(['operator.multi@demo.nawara.invalid']);
    expect(text(element.querySelector('[role="status"]'))).toBe('Showing 1 of 6');
    input.value = '+999 (0000) 0001';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(contacts(element)).toEqual(['+99900000001']);
    expect(router.url).toBe('/operators');
    input.value = 'nobody';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(tableRows(element)).toHaveLength(0);
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.noResultsTitle);
    element.querySelector<HTMLButtonElement>('nw-data-state button')?.click();
    await settle();
    expect(tableRows(element)).toHaveLength(6);
  });

  it('filters by Platform, by no access and by account state, and sorts, in the URL', async () => {
    const { element, router, settle } = await render();
    const select = (name: string) =>
      element.querySelector<HTMLSelectElement>(`select[data-filter="${name}"]`);
    const choose = async (name: string, value: string) => {
      const s = select(name);
      if (!s) throw new Error(`no ${name} select`);
      s.value = value;
      s.dispatchEvent(new Event('change'));
      await settle(20);
    };
    expect([...(select('platform')?.options ?? [])].map((o) => o.text.trim())).toEqual([
      t.platformFilter.any,
      'Nawara School',
      'Nawara Drive',
      t.platformFilter.none,
    ]);
    await choose('platform', DRIVE);
    expect(router.url).toBe(`/operators?platform=${DRIVE}`);
    expect(contacts(element)).toEqual(['+99900000001', 'operator.multi@demo.nawara.invalid']);
    await choose('platform', 'none');
    expect(contacts(element)).toEqual([
      'operator.blocked@demo.nawara.invalid',
      'operator.unassigned@demo.nawara.invalid',
    ]);
    await choose('state', 'blocked');
    expect(contacts(element)).toEqual(['operator.blocked@demo.nawara.invalid']);
    await choose('platform', 'any');
    await choose('state', 'any');
    await choose('sort', 'platforms');
    expect(router.url).toBe('/operators?sort=platforms');
    expect(contacts(element)[0]).toBe('operator.multi@demo.nawara.invalid');
  });

  it('opens on a shared filter URL', async () => {
    const { element } = await render(undefined, `/operators?platform=${SCHOOL}&sort=newest`);
    expect(contacts(element)).toEqual([
      'operator.new@demo.nawara.invalid',
      'operator.multi@demo.nawara.invalid',
      'operator.school@demo.nawara.invalid',
    ]);
  });

  it('shows an operator nothing and requests nothing (the route guard sends them away first)', async () => {
    const { element, listSpy } = await renderOperators(
      OperatorDirectoryPage,
      operatorOf(DEMO_OPERATOR_IDS.multi, [SCHOOL, DRIVE]),
      DEMO_OPERATOR_IDS.multi,
      '/operators',
    );
    expect(listSpy).not.toHaveBeenCalled();
    expect(tableRows(element)).toHaveLength(0);
    expect(element.textContent).not.toContain('@demo.nawara.invalid');
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.forbiddenDescription);
  });

  it('says the directory is not available in a build without demo data (no Core route exists)', async () => {
    const { element } = await render({ directory: 'unavailable' });
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.notInBuildTitle);
    expect(tableRows(element)).toHaveLength(0);
  });

  it('shows an empty Company', async () => {
    const empty = await render({ scenario: 'empty' });
    expect(text(empty.element.querySelector('nw-data-state'))).toContain(t.states.emptyTitle);
  });

  it('offers Try again after an outage, which loads again', async () => {
    const { element, listSpy, settle } = await render({ scenario: 'error' });
    expect(text(element.querySelector('nw-data-state'))).toContain(t.states.errorTitle);
    element.querySelector<HTMLButtonElement>('nw-data-state button')?.click();
    await settle(20);
    expect(listSpy).toHaveBeenCalledTimes(2);
  });
});
