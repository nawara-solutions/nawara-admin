import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, ElementRef, signal, viewChild } from '@angular/core';
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

const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
];

/** The category selector is ready for the future search contracts; no data source is currently available. */
@Component({
  selector: 'adm-global-search',
  imports: [
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    TranslocoPipe,
    NwIcon,
    NwMenu,
    NwMenuItem,
    NwMenuTrigger,
  ],
  templateUrl: './global-search.html',
  styleUrl: './global-search.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'global-search' },
})
export class GlobalSearch {
  private static nextId = 0;

  protected readonly categories = CATEGORIES;
  protected readonly selected = signal<SearchCategory>('all');
  protected readonly open = signal(false);
  protected readonly positions = POSITIONS;
  private readonly compactTrigger = viewChild('compactTrigger', {
    read: ElementRef<HTMLButtonElement>,
  });
  private readonly searchInput = viewChild('searchInput', { read: ElementRef<HTMLInputElement> });
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
    this.open.set(false);
    queueMicrotask(() => this.compactTrigger()?.nativeElement.focus());
  }

  protected focusSearch(): void {
    this.searchInput()?.nativeElement.focus();
  }

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected onOverlayClick(): void {
    this.open.set(false);
  }

  protected get unavailableDescriptionId(): string {
    return this.unavailableId;
  }
}
