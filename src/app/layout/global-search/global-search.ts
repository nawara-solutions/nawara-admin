import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, map, of, startWith, switchMap, timer } from 'rxjs';
import { AuthSession } from '../../core/auth/auth-session';
import { LocaleService } from '../../core/i18n/locale.service';
import { NwNumberPipe } from '../../shared/format/format.pipes';
import { NwIcon } from '../../shared/ui/icon/icon';
import type { NwIconName } from '../../shared/ui/icon/icon.registry';
import { NwMenu, NwMenuItem, NwMenuTrigger } from '../../shared/ui/menu/menu';
import { normalizeSearch, searchPages } from './search-pages';
import { SearchResultRow, SearchResult } from './search-result-row';
import {
  RecordCategory,
  SearchCategory,
  SearchRecord,
  SearchRecordSource,
} from './search-record-source';
export type { SearchCategory } from './search-record-source';

const CATEGORIES: readonly {
  id: SearchCategory;
  key: string;
  placeholder: string;
  icon: NwIconName;
  path: string | null;
  destination: string | null;
  requires?: 'company.platforms.view' | 'company.operators.view';
}[] = [
  {
    id: 'all',
    key: 'shell.search.categories.all',
    placeholder: 'shell.search.command.placeholder',
    icon: 'search',
    path: null,
    destination: null,
  },
  {
    id: 'organizations',
    key: 'shell.search.categories.organizations',
    placeholder: 'shell.search.command.organizationsPlaceholder',
    icon: 'building-2',
    path: '/platforms',
    destination: 'shell.nav.platforms',
    requires: 'company.platforms.view',
  },
  {
    id: 'members',
    key: 'shell.search.categories.members',
    placeholder: 'shell.search.command.membersPlaceholder',
    icon: 'users',
    path: null,
    destination: null,
  },
  {
    id: 'operators',
    key: 'shell.search.categories.operators',
    placeholder: 'shell.search.command.operatorsPlaceholder',
    icon: 'user-round',
    path: '/operators',
    destination: 'shell.nav.operators',
    requires: 'company.operators.view',
  },
  {
    id: 'platforms',
    key: 'shell.search.categories.platforms',
    placeholder: 'shell.search.command.platformsPlaceholder',
    icon: 'hexagon',
    path: '/platforms',
    destination: 'shell.nav.platforms',
    requires: 'company.platforms.view',
  },
];

@Component({
  selector: 'adm-global-search',
  imports: [
    TranslocoPipe,
    NwIcon,
    NwMenu,
    NwMenuItem,
    NwMenuTrigger,
    NwNumberPipe,
    SearchResultRow,
  ],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'global-search',
    '[class.global-search--compact]': 'compact()',
    '(document:keydown)': 'shortcut($event)',
  },
})
export class GlobalSearch {
  readonly compact = input(false, { transform: booleanAttribute });
  private static nextId = 0;
  protected readonly id = `global-search-${GlobalSearch.nextId++}`;
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(AuthSession);
  private readonly locale = inject(LocaleService);
  private readonly transloco = inject(TranslocoService);
  private readonly source = inject(SearchRecordSource, { optional: true });
  private readonly language = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('searchTrigger');
  private readonly modal = viewChild.required<TemplateRef<unknown>>('searchModal');
  private dialogRef: DialogRef | undefined;
  protected readonly categories = CATEGORIES;
  protected readonly selected = signal<SearchCategory>('all');
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly open = signal(false);
  protected readonly category = computed(
    () => CATEGORIES.find((item) => item.id === this.selected()) ?? CATEGORIES[0]!,
  );
  protected readonly connected = computed(
    () => this.source?.categories.includes(this.selected() as RecordCategory) ?? false,
  );
  protected readonly disconnected = computed(() => this.selected() !== 'all' && !this.connected());
  protected readonly anyRecords = !!this.source?.categories.length;

  private readonly request = computed(() => ({
    query: this.query().trim(),
    category: this.selected(),
    actor: this.session.actor(),
    open: this.open(),
    epoch: this.session.epoch(),
  }));
  private readonly recordState = toSignal(
    toObservable(this.request).pipe(
      switchMap((request) => {
        if (
          !request.open ||
          !request.actor ||
          !request.query ||
          !this.source ||
          !this.source.categories.length ||
          (request.category !== 'all' && !this.source.categories.includes(request.category))
        )
          return of({
            request,
            records: [] as readonly SearchRecord[],
            loading: false,
            failed: false,
          });
        return timer(150).pipe(
          switchMap(() => this.source!.search(request.query, request.category, request.actor!)),
          map((records) => ({ request, records, loading: false, failed: false })),
          catchError(() =>
            of({ request, records: [] as readonly SearchRecord[], loading: false, failed: true }),
          ),
          startWith({
            request,
            records: [] as readonly SearchRecord[],
            loading: true,
            failed: false,
          }),
        );
      }),
    ),
    { initialValue: null },
  );
  private readonly currentRecords = computed(() =>
    this.recordState()?.request === this.request() ? this.recordState() : null,
  );
  protected readonly loading = computed(() => this.currentRecords()?.loading ?? false);
  protected readonly failed = computed(() => this.currentRecords()?.failed ?? false);

  protected readonly results = computed<readonly SearchResult[]>(() => {
    this.language();
    const query = normalizeSearch(this.query());
    if (!this.open() || !this.session.actor() || !query || this.disconnected()) return [];
    const pages: SearchResult[] =
      this.selected() === 'all'
        ? searchPages(this.session.actor())
            .map((page) => ({
              id: page.path,
              title: this.transloco.translate(page.titleKey),
              description: this.transloco.translate(page.descriptionKey),
              path: page.path,
              group: page.group,
              icon: page.icon,
              record: false,
            }))
            .filter((page) => normalizeSearch(page.title + ' ' + page.description).includes(query))
        : [];
    const records = (this.currentRecords()?.records ?? [])
      .filter(
        (record) =>
          this.source?.categories.includes(record.category) &&
          (this.selected() === 'all' || record.category === this.selected()) &&
          record.path.startsWith('/') &&
          !record.path.startsWith('//') &&
          !record.path.includes('\\'),
      )
      .map((record): SearchResult => ({
        ...record,
        id: record.category + ':' + record.id,
        group: record.category,
        icon:
          record.icon ??
          (record.category === 'members' || record.category === 'operators'
            ? 'user-round'
            : 'building-2'),
        record: true,
      }));
    const order = ['pages', 'settings', 'members', 'operators', 'organizations', 'platforms'];
    return [...pages, ...records]
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group))
      .slice(0, 40);
  });
  protected readonly groups = computed(() => {
    const keys = {
      pages: 'shell.search.command.pages',
      settings: 'settings.title',
      members: 'shell.search.categories.members',
      operators: 'shell.search.categories.operators',
      organizations: 'shell.search.categories.organizations',
      platforms: 'shell.search.categories.platforms',
    } as const;
    const results = this.results();
    return Object.entries(keys)
      .map(([group, key]) => ({
        key,
        results: results
          .map((result, index) => ({ ...result, index }))
          .filter((result) => result.group === group),
      }))
      .filter((group) => group.results.length);
  });
  protected readonly suggestions = computed(() => {
    this.language();
    const paths = ['/audit', '/billing', '/settings/security', '/settings/appearance'];
    return searchPages(this.session.actor())
      .filter((page) => paths.includes(page.path))
      .sort((a, b) => paths.indexOf(a.path) - paths.indexOf(b.path));
  });
  protected readonly destination = computed(() => {
    const category = this.category();
    return searchPages(this.session.actor()).find((page) => page.path === category.path) ?? null;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.dialogRef?.close());
    effect(() => {
      this.results();
      this.active.set(0);
    });
    effect(() => {
      if (this.open() && !this.session.actor()) this.dismiss();
    });
  }
  protected select(category: SearchCategory): void {
    this.selected.set(category);
    this.active.set(0);
    this.focusInput();
  }
  protected type(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }
  protected clear(): void {
    this.query.set('');
    this.active.set(0);
    this.focusInput();
  }
  protected suggest(key: string): void {
    this.selected.set('all');
    this.query.set(this.transloco.translate(key));
    this.focusInput();
  }
  private focusInput(): void {
    this.document.querySelector<HTMLInputElement>('#' + this.id + '-input')?.focus();
  }
  protected dismiss(): void {
    this.dialogRef?.close();
  }
  protected async navigate(path: string): Promise<void> {
    this.dismiss();
    await this.router.navigateByUrl(path);
  }
  protected keydown(event: KeyboardEvent): void {
    if (event.isComposing || this.disconnected()) return;
    const size = this.results().length;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && size) {
      event.preventDefault();
      this.active.update((index) => (index + (event.key === 'ArrowDown' ? 1 : -1) + size) % size);
      this.document
        .getElementById(this.id + '-option-' + this.active())
        ?.scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter' && size) {
      event.preventDefault();
      const result = this.results()[this.active()] ?? this.results()[0];
      if (result) void this.navigate(result.path);
    }
  }
  protected shortcut(event: KeyboardEvent): void {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'k' &&
      !event.altKey &&
      this.session.actor()
    ) {
      event.preventDefault();
      this.toggle();
    }
  }
  protected toggle(): void {
    if (this.open()) {
      this.dismiss();
      return;
    }
    this.query.set('');
    this.active.set(0);
    this.open.set(true);
    this.dialogRef = this.dialog.open(this.modal(), {
      ariaLabelledBy: this.id + '-title',
      ariaModal: true,
      autoFocus: '.global-search__input',
      restoreFocus: this.trigger().nativeElement.closest('[inert]')
        ? (this.document.querySelector<HTMLElement>('.top-bar__menu') ??
          this.trigger().nativeElement)
        : this.trigger().nativeElement,
      direction: this.locale.direction(),
      backdropClass: 'nw-overlay-backdrop',
      panelClass: 'nw-search-pane',
      positionStrategy: this.overlay
        .position()
        .global()
        .centerHorizontally()
        .top('min(16vh, 8rem)'),
      maxHeight: 'calc(100dvh - 1rem)',
    });
    this.dialogRef.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.open.set(false);
      this.query.set('');
      this.dialogRef = undefined;
    });
  }
}
