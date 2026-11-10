import { calculateBreadcrumbLayout, splitBreadcrumbs } from './breadcrumb-layout';

const layout = (availableWidth: number, ancestors: readonly number[], current = 72) =>
  calculateBreadcrumbLayout(availableWidth, ancestors, current, 32, 16, 32, 8, 224);

describe('calculateBreadcrumbLayout', () => {
  it('keeps a home-only trail without an unnecessary overflow control', () => {
    expect(layout(180, [])).toEqual({
      hiddenAncestorCount: 0,
      showHome: true,
      currentMaxWidth: 72,
    });
  });

  it('keeps the full two-level trail when it fits', () => {
    expect(layout(250, [72])).toMatchObject({ hiddenAncestorCount: 0, showHome: true });
  });

  it('hides only the oldest ancestor and accounts for the overflow control', () => {
    const result = layout(315, [72, 80]);
    expect(result.hiddenAncestorCount).toBe(1);
    expect(result.currentMaxWidth).toBe(72);
  });

  it('collapses every ancestor before shrinking a long current label', () => {
    const result = layout(190, [64, 80, 96, 112], 320);
    expect(result.hiddenAncestorCount).toBe(4);
    expect(result.currentMaxWidth).toBeGreaterThan(0);
    expect(result.currentMaxWidth).toBeLessThan(320);
    expect(result.showHome).toBe(false);
  });

  it('moves Home into the accessible overflow menu before truncating the current page', () => {
    const result = layout(176, [65], 68);
    expect(result.hiddenAncestorCount).toBe(1);
    expect(result.showHome).toBe(false);
    expect(result.currentMaxWidth).toBe(68);
  });

  it('keeps a short current page at natural width at the compact desktop threshold', () => {
    const result = layout(132, [65], 68);
    expect(result.showHome).toBe(false);
    expect(result.hiddenAncestorCount).toBe(1);
    expect(result.currentMaxWidth).toBe(68);
  });

  it('preserves a readable current-page label by collapsing its parents first', () => {
    const result = layout(250, [80, 90], 110);
    expect(result.hiddenAncestorCount).toBe(2);
    expect(result.currentMaxWidth).toBe(110);
    expect(result.showHome).toBe(true);
  });

  it('keeps a short current page at natural width without showing an unnecessary ellipsis', () => {
    const result = layout(180, [], 72);
    expect(result.hiddenAncestorCount).toBe(0);
    expect(result.currentMaxWidth).toBe(72);
  });

  it('uses an accessible home alternative when Home and the current page cannot both fit', () => {
    const result = layout(120, [72, 80, 96], 180);
    expect(result.hiddenAncestorCount).toBe(3);
    expect(result.showHome).toBe(false);
    expect(result.currentMaxWidth).toBeGreaterThan(0);
  });

  it('never assigns a negative width to the current label when the header has almost no space', () => {
    expect(layout(10, [50], 100).currentMaxWidth).toBe(0);
  });

  it('does not let a stale collapse count move the current item into the hidden ancestors', () => {
    const split = splitBreadcrumbs(['Company', 'Platforms'], 8);
    expect(split.hiddenAncestors).toEqual(['Company']);
    expect(split.visibleAncestors).toEqual([]);
    expect(split.current).toBe('Platforms');
  });

  it('keeps Platforms visible when switching from a deep route with a larger collapse count', () => {
    const deep = splitBreadcrumbs(
      ['Company', 'Platforms', 'Nawara Drive', 'Organizations', 'École Horizon', 'Members'],
      5,
    );
    const platforms = splitBreadcrumbs(['Company', 'Platforms'], deep.hiddenAncestors.length);
    expect(platforms.hiddenAncestors).toEqual(['Company']);
    expect(platforms.hiddenAncestors).not.toContain(platforms.current);
    expect(platforms.current).toBe('Platforms');
  });

  it('allows ancestor expansion again when the available width grows', () => {
    const compact = layout(180, [64, 80, 96]);
    const wide = layout(480, [64, 80, 96]);
    expect(compact.hiddenAncestorCount).toBeGreaterThan(wide.hiddenAncestorCount);
    expect(wide.hiddenAncestorCount).toBe(0);
  });
});
