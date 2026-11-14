import en from '../../../../i18n/en.json';
import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID, demoWorldSeed } from '../../../demo/world/seed';
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

  it('paginates filtered operators and supports 10, 50 and all rows', async () => {
    const { element, settle } = await render({
      seed: (now) => {
        const world = demoWorldSeed(now);
        const example = world.operators[0]!;
        return {
          ...world,
          operators: [
            ...world.operators,
            ...Array.from({ length: 55 }, (_, index) => ({
              ...example,
              id: `99999999-0000-4000-8000-${String(index).padStart(12, '0')}` as typeof example.id,
              email: index === 0 ? 'firstextra@example.invalid' : `extra${index}@example.invalid`,
              phone: null,
            })),
          ],
        };
      },
    });
    const chooseSize = async (index: number) => {
      element.querySelector<HTMLButtonElement>('.operator-directory__page-size-trigger')!.click();
      await settle();
      const sizes = document.querySelectorAll<HTMLButtonElement>(
        '.operator-directory__page-size-menu button',
      );
      sizes[index]!.click();
      await settle();
    };
    const buttons = () =>
      element.querySelectorAll<HTMLButtonElement>('.operator-directory__page-actions button');
    expect(tableRows(element)).toHaveLength(10);
    const firstPage = contacts(element);
    buttons()[1]!.click();
    await settle();
    expect(contacts(element)).not.toEqual(firstPage);
    await chooseSize(1);
    expect(tableRows(element)).toHaveLength(50);
    buttons()[1]!.click();
    await settle();
    expect(tableRows(element)).toHaveLength(11);
    await chooseSize(2);
    expect(tableRows(element)).toHaveLength(61);
    await chooseSize(0);
    buttons()[1]!.click();
    await settle();
    const search = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'firstextra';
    search.dispatchEvent(new Event('input'));
    await settle();
    expect(tableRows(element)).toHaveLength(1);
    expect(contacts(element)).toEqual(['firstextra@example.invalid']);
  });

  it('toggles each header sort in the URL and exposes its direction', async () => {
    const { element, router, settle } = await render();
    for (const [index, sort, direction] of [
      [0, 'contact-desc', 'descending'],
      [0, 'contact', 'ascending'],
      [1, 'platforms', 'descending'],
      [1, 'platforms-asc', 'ascending'],
      [2, 'state', 'ascending'],
      [2, 'state-desc', 'descending'],
      [3, 'newest', 'descending'],
      [3, 'oldest', 'ascending'],
    ] as const) {
      const header = element.querySelectorAll('.operator-list__table thead th')[index]!;
      header.querySelector<HTMLButtonElement>('button')!.click();
      await settle(20);
      expect(router.url).toBe(sort === 'contact' ? '/operators' : `/operators?sort=${sort}`);
      expect(header.getAttribute('aria-sort')).toBe(direction);
    }
  });

  it('resets search, platform, account state and sorting together', async () => {
    const { element, router, settle } = await render(
      undefined,
      `/operators?platform=${SCHOOL}&state=canSignIn&sort=newest`,
    );
    const input = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'school';
    input.dispatchEvent(new Event('input'));
    await settle();
    element.querySelector<HTMLButtonElement>('.operator-directory__reset')!.click();
    await settle(20);
    expect(input.value).toBe('');
    expect(router.url).toBe('/operators');
    expect(tableRows(element)).toHaveLength(6);
    expect(element.querySelector<HTMLButtonElement>('.operator-directory__reset')!.disabled).toBe(
      true,
    );
  });

  it('shows assignment totals by platform and links each row to the same operator', async () => {
    const { element, settle } = await render();
    const legend = () => [...element.querySelectorAll('.operator-directory__legend li')].map(text);
    expect(legend()).toEqual(expect.arrayContaining(['Nawara School 3', 'Nawara Drive 2']));
    for (const row of tableRows(element)) {
      expect(row.querySelector('.operator-list__action')?.getAttribute('href')).toBe(
        row.querySelector('.operator-list__link')?.getAttribute('href'),
      );
      expect(row.querySelector('.operator-list__action')?.getAttribute('aria-label')).toContain(
        text(row.querySelector('.operator-list__link')),
      );
    }
    const input = element.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = 'multi';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(tableRows(element)).toHaveLength(1);
    expect(legend()).toEqual(expect.arrayContaining(['Nawara School 3', 'Nawara Drive 2']));
  });

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
    expect(totals).toEqual(['5', '2']);
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
    expect(element.querySelector('.operator-directory__provisional')).toBeNull();
    expect(element.querySelector('.operator-directory__later')).toBeNull();
    expect(text(element.querySelector('.operators-header__demo'))).toContain(en.shell.demo.badge);
  });

  it('opens the operator panel without navigating from the directory', async () => {
    const { element, router, settle } = await render();
    const row = tableRows(element)[2]!;
    row.querySelector<HTMLButtonElement>('.operator-list__link')!.click();
    await settle(30);
    expect(router.url).toBe('/operators');
    expect(text(document.querySelector('adm-operator-detail-panel'))).toContain(
      'operator.multi@demo.nawara.invalid',
    );
    expect(text(document.querySelector('adm-operator-detail-panel'))).toContain(
      t.detail.current.title,
    );
    expect(document.querySelector('adm-operator-detail-panel [data-give-access]')).toBeNull();
    TestBed.inject(Dialog).closeAll();
  });

  it('opens row actions with the selected operator and does not change access before confirmation', async () => {
    const { element, settle, grantSpy, blockSpy } = await render();
    const unassigned = tableRows(element)[5]!;
    unassigned.querySelector<HTMLButtonElement>('.operator-list__action--grant')!.click();
    await settle(40);
    expect(document.querySelector('adm-platform-access-dialog')).not.toBeNull();
    expect(text(document.querySelector('adm-platform-access-dialog'))).toContain(
      'operator.unassigned@demo.nawara.invalid',
    );
    expect(grantSpy).not.toHaveBeenCalled();
    TestBed.inject(Dialog).closeAll();
    await settle(20);
    unassigned.querySelector<HTMLButtonElement>('.operator-list__action--danger')!.click();
    await settle(40);
    expect(document.querySelector('adm-operator-block-dialog')).not.toBeNull();
    expect(text(document.querySelector('adm-operator-block-dialog'))).toContain(
      'operator.unassigned@demo.nawara.invalid',
    );
    expect(blockSpy).not.toHaveBeenCalled();
    document
      .querySelector<HTMLButtonElement>('adm-operator-block-dialog button[data-confirm]')!
      .click();
    await settle(60);
    expect(blockSpy).toHaveBeenCalledOnce();
    expect(blockSpy.mock.calls[0]?.[0]).toBe(DEMO_OPERATOR_IDS.unassigned);
    const updated = tableRows(element).find((row) =>
      text(row).includes('operator.unassigned@demo.nawara.invalid'),
    )!;
    expect(updated.querySelector('[title="' + t.account.unblockOpen + '"]')).not.toBeNull();
    TestBed.inject(Dialog).closeAll();
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
    expect(element.querySelector('nw-data-state button')).toBeNull();
    element.querySelector<HTMLButtonElement>('.operator-directory__reset')?.click();
    await settle();
    expect(tableRows(element)).toHaveLength(6);
  });

  it('filters by Platform, by no access and by account state, and sorts, in the URL', async () => {
    const { element, router, settle } = await render();
    const choose = async (name: string, value: string) => {
      element
        .querySelector<HTMLButtonElement>(
          name === 'sort'
            ? '.operator-directory__sort-button'
            : '.operator-directory__filter-button',
        )!
        .click();
      await settle();
      const option = document.querySelector<HTMLInputElement>(
        `adm-operator-filter-dialog input[name="${name}"][value="${value}"]`,
      );
      if (!option) throw new Error('missing filter option');
      option.click();
      await settle();
      const apply = [
        ...document.querySelectorAll<HTMLButtonElement>('adm-operator-filter-dialog button'),
      ].find((button) => text(button) === t.filters.apply);
      apply!.click();
      await settle(20);
    };
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
