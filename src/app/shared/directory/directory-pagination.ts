import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwIcon } from '../ui/icon/icon';

export type DirectoryPageSize = 10 | 50 | 'all';
export type DirectoryPaginationVariant = 'organization' | 'operator';

/**
 * The Organization and operator directories' pagination bar (WP-5.2b): the count, the page-size menu and previous /
 * next, rendered inside the page's own `<nav>` (the page keeps its classes and label on it). Presentation only: the
 * page owns the page size and the page, and decides what a change means; this component only says which change was
 * asked for. The only state here is whether the page-size menu is open.
 *
 * The variant keeps each directory's existing class names and ids (`organization-directory__…`,
 * `organization-page-size-label`, `aria-controls="organization-directory-list"`; likewise for operators), and the
 * stylesheet carries each directory's existing pagination rules unchanged.
 */
@Component({
  selector: 'nav[adm-directory-pagination]',
  imports: [CdkConnectedOverlay, CdkOverlayOrigin, NwIcon, TranslocoPipe],
  templateUrl: './directory-pagination.html',
  styleUrl: './directory-pagination.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectoryPagination {
  readonly variant = input.required<DirectoryPaginationVariant>({
    alias: 'adm-directory-pagination',
  });
  /** "Showing x of y", already translated (each directory words it its own way). */
  readonly count = input.required<string>();
  readonly pageSize = input.required<DirectoryPageSize>();
  readonly pageIndex = input.required<number>();
  readonly pageCount = input.required<number>();
  readonly pageSizeChange = output<DirectoryPageSize>();
  readonly pageChange = output<number>();

  protected readonly block = computed(() => `${this.variant()}-directory`);
  protected readonly pageSizes = [10, 50, 'all'] as const;
  protected readonly pageSizeOpen = signal(false);
  protected readonly popupPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  ];

  protected choose(size: DirectoryPageSize): void {
    this.pageSizeOpen.set(false);
    this.pageSizeChange.emit(size);
  }
}
