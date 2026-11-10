import { OverlayContainer } from '@angular/cdk/overlay';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Subject, of, throwError } from 'rxjs';
import en from '../../../i18n/en.json';
import fr from '../../../i18n/fr.json';
import ar from '../../../i18n/ar.json';
import { Actor } from '../../core/auth/actor';
import { AuthSession } from '../../core/auth/auth-session';
import { APP_ENVIRONMENT } from '../../core/config/app-environment';
import { companyId, platformId } from '../../core/context/scope.model';
import { LocaleService } from '../../core/i18n/locale.service';
import { GlobalSearch } from './global-search';
import { SearchRecord, SearchRecordSource } from './search-record-source';

@Component({ template: '' })
class Destination {}
const owner: Actor = {
  kind: 'owner',
  userId: 'owner',
  email: 'owner@example.invalid',
  companyId: companyId('c'),
};
const operator: Actor = {
  kind: 'operator',
  userId: 'operator',
  email: null,
  platformAssignments: [platformId('p')],
};
const t = en.shell.search;
const text = (element: Element | null | undefined) =>
  element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const records: readonly SearchRecord[] = [
  {
    id: '1',
    category: 'members',
    title: 'Salim Anouar',
    description: 'owner@demo.nawara.invalid · Company owner',
    initials: 'SA',
    path: '/test/member-1',
  },
  {
    id: '2',
    category: 'members',
    title: 'Samira Trabelsi',
    description: 'Member · Invitation pending',
    initials: 'ST',
    path: '/test/member-2',
  },
  {
    id: '3',
    category: 'operators',
    title: 'Sami Ben Salah',
    description: 'Operator · Nawara Health',
    initials: 'SB',
    path: '/test/operator-1',
  },
  {
    id: '4',
    category: 'organizations',
    title: 'Salam Medical Center',
    description: 'Organization · Nawara Health',
    path: '/test/organization-1',
  },
  {
    id: '5',
    category: 'organizations',
    title: 'Sahel Logistics',
    description: 'Organization · Nawara Commerce',
    path: '/test/organization-2',
  },
];
async function render({
  actor = owner,
  source,
}: { actor?: Actor; source?: SearchRecordSource } = {}) {
  TestBed.configureTestingModule({
    imports: [
      GlobalSearch,
      TranslocoTestingModule.forRoot({
        langs: { en, fr, ar },
        translocoConfig: {
          availableLangs: ['en', 'fr', 'ar'],
          defaultLang: 'en',
          reRenderOnLangChange: true,
        },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideRouter([{ path: '**', component: Destination }]),
      {
        provide: APP_ENVIRONMENT,
        useValue: {
          production: false,
          demo: { load: () => Promise.reject(new Error('Search must not load demo bindings')) },
        },
      },
      ...(source ? [{ provide: SearchRecordSource, useValue: source }] : []),
    ],
  });
  TestBed.inject(AuthSession).establish(actor);
  const fixture = TestBed.createComponent(GlobalSearch);
  fixture.detectChanges();
  await fixture.whenStable();
  const overlay = TestBed.inject(OverlayContainer).getContainerElement();
  const trigger = fixture.nativeElement.querySelector(
    '.global-search__compact',
  ) as HTMLButtonElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const open = async () => {
    trigger.click();
    await settle();
  };
  const input = () => overlay.querySelector<HTMLInputElement>('.global-search__input')!;
  const type = async (value: string) => {
    input().value = value;
    input().dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const key = async (key: string) => {
    input().dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        keyCode: key === 'Escape' ? 27 : 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
  };
  const category = async (index: number) => {
    overlay.querySelector<HTMLButtonElement>('.global-search__category')!.click();
    await settle();
    overlay.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[index]!.click();
    await settle();
  };
  return { fixture, overlay, trigger, open, input, type, key, settle, category };
}

describe('Global search command dialog', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';
    document.querySelectorAll('.cdk-overlay-container').forEach((element) => element.remove());
    vi.restoreAllMocks();
  });

  it('opens ready for typing, traps focus, and restores focus on Escape and backdrop dismissal', async () => {
    const r = await render();
    await r.open();
    expect(r.input().readOnly).toBe(false);
    expect(document.activeElement).toBe(r.input());
    expect(text(r.overlay)).toContain(t.command.pagesOnlyHint);
    expect(r.overlay.querySelector('.global-search__panel')).toBeNull();
    expect(r.overlay.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(r.overlay.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe(
      r.overlay.querySelector('h2')?.id,
    );
    expect(r.overlay.querySelectorAll('.cdk-focus-trap-anchor')).toHaveLength(2);
    await r.key('Escape');
    expect(r.overlay.querySelector('.global-search__modal')).toBeNull();
    expect(document.activeElement).toBe(r.trigger);
    await r.open();
    r.overlay.querySelector<HTMLElement>('.cdk-overlay-backdrop')!.click();
    await r.settle();
    expect(r.overlay.querySelector('.global-search__modal')).toBeNull();
    expect(document.activeElement).toBe(r.trigger);
  });

  it('opens a quick link directly from the initial dialog', async () => {
    const r = await render();
    await r.open();
    const links = r.overlay.querySelectorAll<HTMLButtonElement>(
      '.global-search__quick-links button',
    );
    expect(links).toHaveLength(4);
    expect(text(links[0])).toContain(en.shell.nav.audit);
    links[0]?.click();
    await r.settle();
    expect(TestBed.inject(Router).url).toBe('/audit');
    expect(r.overlay.querySelector('.global-search__modal')).toBeNull();
  });

  it('finds authorized pages by title and description, highlights literal text, and navigates by keyboard', async () => {
    const r = await render();
    await r.open();
    await r.type('acc');
    expect([...r.overlay.querySelectorAll('.global-search__result-title')].map(text)).toEqual([
      en.shell.nav.operators,
      en.settings.appearance.title,
      en.settings.account.title,
    ]);
    expect([...r.overlay.querySelectorAll('.global-search__group-label')].map(text)).toEqual([
      t.command.pages,
      en.settings.title,
    ]);
    expect(r.overlay.querySelectorAll('.global-search__match')).toHaveLength(2);
    expect(text(r.overlay.querySelector('.global-search__count'))).toBe('3 results');
    expect(r.input().getAttribute('aria-controls')).toBe(
      r.overlay.querySelector('[role="listbox"]')?.id,
    );
    await r.key('ArrowDown');
    expect(r.input().getAttribute('aria-activedescendant')).toBe(
      r.overlay.querySelector('[aria-selected="true"]')?.id,
    );
    expect(
      text(r.overlay.querySelector('[aria-selected="true"] .global-search__result-title')),
    ).toBe(en.settings.appearance.title);
    await r.key('Enter');
    expect(TestBed.inject(Router).url).toBe('/settings/appearance');
    expect(r.overlay.querySelector('.global-search__modal')).toBeNull();
  });

  it('shows no matches, accepts suggestion chips and clears back to the initial state', async () => {
    const r = await render();
    await r.open();
    await r.type('payroll');
    expect(text(r.overlay.querySelector('.global-search__empty h3'))).toBe(
      'Nothing matches “payroll”',
    );
    expect(text(r.overlay.querySelector('.global-search__empty p'))).toBe(t.command.noMatchesPages);
    expect(text(r.overlay.querySelector('.global-search__count'))).toBe('0 results');
    r.overlay.querySelector<HTMLButtonElement>('.global-search__suggestions button')!.click();
    await r.settle();
    expect(r.overlay.querySelectorAll('[role="option"]')).toHaveLength(1);
    r.overlay.querySelector<HTMLButtonElement>('.global-search__clear')!.click();
    await r.settle();
    expect(r.input().value).toBe('');
    expect(document.activeElement).toBe(r.input());
    expect(r.overlay.querySelector('.global-search__panel')).toBeNull();
    await r.type('<img src=x onerror=alert(1)>');
    expect(r.overlay.querySelector('img')).toBeNull();
    expect(text(r.overlay.querySelector('.global-search__empty'))).toContain(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('shows the not-connected category state and a permitted destination, preserving category on reopen', async () => {
    const r = await render();
    await r.open();
    await r.category(1);
    expect(r.input().placeholder).toBe(t.command.organizationsPlaceholder);
    expect(text(r.overlay.querySelector('.global-search__unavailable h3'))).toBe(
      'Searching Organizations isn’t available yet',
    );
    expect(text(r.overlay.querySelector('.global-search__unavailable p'))).toBe(
      t.command.notConnectedBody,
    );
    expect(text(r.overlay.querySelector('.global-search__destination'))).toBe(
      'Open Platforms & organizations',
    );
    await r.key('Escape');
    await r.open();
    expect(text(r.overlay.querySelector('.global-search__category'))).toBe(
      t.categories.organizations,
    );
    r.overlay.querySelector<HTMLButtonElement>('.global-search__destination')!.click();
    await r.settle();
    expect(TestBed.inject(Router).url).toBe('/platforms');
  });

  it('never offers company pages or destinations to an operator, and closes on sign-out', async () => {
    const r = await render({ actor: operator });
    await r.open();
    await r.type('billing');
    expect(r.overlay.querySelector('[role="option"]')).toBeNull();
    expect(text(r.overlay.querySelector('.global-search__suggestions'))).not.toContain(
      en.shell.nav.audit,
    );
    await r.category(1);
    expect(r.overlay.querySelector('.global-search__destination')).toBeNull();
    TestBed.inject(AuthSession).signOut();
    await r.settle();
    expect(r.overlay.querySelector('.global-search__modal')).toBeNull();
  });

  it('supports Ctrl/Cmd+K, ArrowUp wrapping and avoids Enter activation during composition', async () => {
    const r = await render();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    await r.settle();
    await r.type('acc');
    await r.key('ArrowUp');
    expect(
      text(r.overlay.querySelector('[aria-selected="true"] .global-search__result-title')),
    ).toBe(en.settings.account.title);
    r.input().dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    await r.settle();
    expect(r.overlay.querySelector('.global-search__modal')).not.toBeNull();
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }),
    );
    await r.settle();
    expect(r.overlay.querySelector('.global-search__modal')).toBeNull();
  });

  it('renders connected records as grouped results with initials and opens the supplied guarded route', async () => {
    const search = vi.fn(() => of(records));
    const r = await render({
      source: { categories: ['members', 'operators', 'organizations'], search },
    });
    await r.open();
    await r.type('sa');
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
    await r.settle();
    expect(search).toHaveBeenCalledWith('sa', 'all', owner);
    expect([...r.overlay.querySelectorAll('.global-search__group-label')].map(text)).toEqual([
      t.categories.members,
      t.categories.operators,
      t.categories.organizations,
    ]);
    expect(
      [...r.overlay.querySelectorAll('.global-search__result-icon--avatar')].map(text),
    ).toEqual(['SA', 'ST', 'SB']);
    expect(text(r.overlay.querySelector('.global-search__count'))).toBe('5 results');
    expect(text(r.overlay.querySelector('.global-search__open-label'))).toBe(t.command.view);
    r.overlay.querySelector<HTMLButtonElement>('[role="option"]')!.click();
    await r.settle();
    expect(TestBed.inject(Router).url).toBe('/test/member-1');
  });

  it('cancels obsolete record searches and drops late results after clearing', async () => {
    const first = new Subject<readonly SearchRecord[]>();
    const second = new Subject<readonly SearchRecord[]>();
    const search = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const r = await render({ source: { categories: ['members'], search } });
    await r.open();
    await r.type('old query');
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
    await r.type('new query');
    expect(r.overlay.querySelector('[role="option"]')).toBeNull();
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    first.next(records);
    await r.settle();
    expect(r.overlay.querySelector('[role="option"]')).toBeNull();
    await r.type('');
    second.next(records);
    await r.settle();
    expect(r.overlay.querySelector('[role="option"]')).toBeNull();
    expect(r.overlay.querySelector('.global-search__idle')).not.toBeNull();
  });

  it('reports record failure without calling it no matches', async () => {
    const r = await render({
      source: { categories: ['members'], search: () => throwError(() => new Error('Unavailable')) },
    });
    await r.open();
    await r.type('zzzz');
    await vi.waitFor(() => {
      r.fixture.detectChanges();
      expect(text(r.overlay.querySelector('.global-search__empty h3'))).toBe(t.command.errorTitle);
    });
    expect(text(r.overlay.querySelector('.global-search__count'))).toBe(t.command.recordError);
  });

  it('matches translated French pages and opens in Arabic RTL without persisting queries', async () => {
    const r = await render();
    await TestBed.inject(LocaleService).use('fr');
    await r.open();
    await r.type('apparence');
    expect(text(r.overlay.querySelector('.global-search__result-title'))).toBe(
      fr.settings.appearance.title,
    );
    await r.key('Escape');
    await TestBed.inject(LocaleService).use('ar');
    await r.open();
    expect(r.overlay.querySelector('[role="dialog"]')?.closest('[dir]')?.getAttribute('dir')).toBe(
      'rtl',
    );
    await r.type(ar.settings.appearance.title);
    expect(text(r.overlay.querySelector('.global-search__result-title'))).toBe(
      ar.settings.appearance.title,
    );
    expect(localStorage.getItem('search')).toBeNull();
    r.fixture.destroy();
    expect(r.overlay.querySelector('.global-search__modal')).toBeNull();
  });
});
