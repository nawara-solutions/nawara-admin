export interface BreadcrumbLayout {
  /** Number of leading ancestors represented by the overflow menu. */
  readonly hiddenAncestorCount: number;
  /** Keep the visible Home link only when it leaves room for the current page. */
  readonly showHome: boolean;
  /** Width reserved for the current page label; the current page is never collapsed. */
  readonly currentMaxWidth: number;
  /** Wrap the current label instead of reducing it to a meaningless ellipsis. */
  readonly wrapCurrent: boolean;
}

export interface BreadcrumbPartition<T> {
  readonly hiddenAncestors: readonly T[];
  readonly visibleAncestors: readonly T[];
  readonly current: T | undefined;
}

/** Keeps the final item structurally separate even if a previous route left an obsolete collapse count. */
export function splitBreadcrumbs<T>(
  crumbs: readonly T[],
  hiddenAncestorCount: number,
): BreadcrumbPartition<T> {
  const ancestors = crumbs.slice(0, -1);
  const count = Math.min(ancestors.length, Math.max(0, Math.floor(hiddenAncestorCount)));
  return {
    hiddenAncestors: ancestors.slice(0, count),
    visibleAncestors: ancestors.slice(count),
    current: crumbs.at(-1),
  };
}

/**
 * Fits the Home link, optional ancestor menu, visible ancestors and current page into the measured navigation width.
 * Ancestors collapse from oldest to newest; the current page is always a separate, visible item.
 */
export function calculateBreadcrumbLayout(
  availableWidth: number,
  ancestorWidths: readonly number[],
  currentWidth: number,
  homeWidth: number,
  separatorWidth: number,
  overflowWidth: number,
  gap: number,
  maxCurrentWidth: number,
  minReadableCurrentWidth = 56,
): BreadcrumbLayout {
  const currentCap = Math.max(0, Math.min(currentWidth, maxCurrentWidth));
  const requiredWidth = (
    hiddenAncestorCount: number,
    currentMaxWidth: number,
    showHome: boolean,
  ): number => {
    const visibleAncestorWidths = ancestorWidths.slice(hiddenAncestorCount);
    const hasOverflow = hiddenAncestorCount > 0;
    const itemWidths = [
      ...(showHome ? [homeWidth] : []),
      ...(hasOverflow ? [overflowWidth] : []),
      ...visibleAncestorWidths,
      currentMaxWidth,
    ];
    const separators = Math.max(0, itemWidths.length - 1);
    const internalSeparators = separators * (separatorWidth + gap);
    const listGaps = separators * gap;
    return itemWidths.reduce((sum, width) => sum + width, 0) + internalSeparators + listGaps;
  };

  for (let hidden = 0; hidden <= ancestorWidths.length; hidden += 1) {
    if (requiredWidth(hidden, currentCap, true) <= availableWidth) {
      return {
        hiddenAncestorCount: hidden,
        showHome: true,
        currentMaxWidth: currentCap,
        wrapCurrent: currentWidth > currentCap,
      };
    }
  }

  const allAncestorsHidden = ancestorWidths.length;
  const widthWithHome = requiredWidth(allAncestorsHidden, 0, true);
  const remainingWithHome = availableWidth - widthWithHome;
  const widthWithoutHome = requiredWidth(allAncestorsHidden, 0, false);
  const remainingWithoutHome = availableWidth - widthWithoutHome;
  // Home is available in the overflow menu when it no longer fits beside the current label. Keep the page name
  // at its natural width before accepting a two-line/wrapped fallback.
  if (remainingWithoutHome >= currentCap && remainingWithoutHome >= remainingWithHome) {
    return {
      hiddenAncestorCount: allAncestorsHidden,
      showHome: false,
      currentMaxWidth: currentCap,
      wrapCurrent: false,
    };
  }

  if (remainingWithHome >= currentCap) {
    return {
      hiddenAncestorCount: allAncestorsHidden,
      showHome: true,
      currentMaxWidth: currentCap,
      wrapCurrent: false,
    };
  }

  const useHome = remainingWithHome >= remainingWithoutHome;
  const remaining = Math.max(0, useHome ? remainingWithHome : remainingWithoutHome);
  const readableMinimum = Math.min(currentCap, minReadableCurrentWidth);
  if (remaining >= readableMinimum) {
    return {
      hiddenAncestorCount: allAncestorsHidden,
      showHome: useHome,
      currentMaxWidth: Math.min(currentCap, remaining),
      wrapCurrent: remaining < currentCap,
    };
  }

  return {
    hiddenAncestorCount: allAncestorsHidden,
    showHome: false,
    currentMaxWidth: Math.min(currentWidth, remainingWithoutHome),
    wrapCurrent: currentWidth > Math.min(currentWidth, remainingWithoutHome),
  };
}
