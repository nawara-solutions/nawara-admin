import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { DOCUMENT } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../../shared/ui/icon/icon';
import type { NwIconName } from '../../shared/ui/icon/icon.registry';
import { NwMenu, NwMenuItem, NwMenuTrigger } from '../../shared/ui/menu/menu';

export type SearchCategory = 'all' | 'organizations' | 'members' | 'operators' | 'platforms';

const CATEGORIES: readonly {
  readonly id: SearchCategory;
  readonly key: string;
  readonly icon: NwIconName;
}[] = [
  { id: 'all', key: 'shell.search.categories.all', icon: 'package' },
  { id: 'organizations', key: 'shell.search.categories.organizations', icon: 'building-2' },
  { id: 'members', key: 'shell.search.categories.members', icon: 'users' },
  { id: 'operators', key: 'shell.search.categories.operators', icon: 'user-round' },
  { id: 'platforms', key: 'shell.search.categories.platforms', icon: 'hexagon' },
];

/** The category selector is ready for the future search contracts; no data source is currently available. */
@Component({
  selector: 'adm-global-search',
  imports: [TranslocoPipe, NwIcon, NwMenu, NwMenuItem, NwMenuTrigger],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'global-search' },
})
export class GlobalSearch {
  private static nextId = 0;

  constructor() {
    this.destroyRef.onDestroy(() => this.dialogRef?.close());
  }

  protected readonly categories = CATEGORIES;
  protected readonly selected = signal<SearchCategory>('all');
  protected readonly open = signal(false);
  private readonly dialog = inject(Dialog);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('searchTrigger');
  private readonly modal = viewChild.required<TemplateRef<unknown>>('searchModal');
  private dialogRef: DialogRef | undefined;

  private readonly unavailableId = `global-search-unavailable-${GlobalSearch.nextId++}`;

  protected categoryKey(category: SearchCategory): string {
    return CATEGORIES.find((item) => item.id === category)?.key ?? 'shell.search.categories.all';
  }

  protected categoryIcon(category: SearchCategory): NwIconName {
    return CATEGORIES.find((item) => item.id === category)?.icon ?? 'package';
  }

  protected select(category: SearchCategory): void {
    this.selected.set(category);
  }

  protected dismiss(): void {
    this.dialogRef?.close();
  }

  protected toggle(): void {
    if (this.open()) {
      this.dismiss();
      return;
    }
    this.open.set(true);
    this.dialogRef = this.dialog.open(this.modal(), {
      ariaLabelledBy: this.unavailableId + '-title',
      ariaDescribedBy: this.unavailableId,
      ariaModal: true,
      autoFocus: '.global-search__input',
      restoreFocus: this.trigger().nativeElement,
      direction: this.document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr',
      backdropClass: 'nw-overlay-backdrop',
      panelClass: 'nw-dialog-pane',
    });
    this.dialogRef.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.open.set(false);
      this.dialogRef = undefined;
    });
  }

  protected get unavailableDescriptionId(): string {
    return this.unavailableId;
  }
}
