import { OverlayContainer } from '@angular/cdk/overlay';
import { DebugElement, getDebugNode } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import { NwIcon } from '../../shared/ui/icon/icon';
import { GlobalSearch } from './global-search';

async function render() {
  TestBed.configureTestingModule({
    imports: [
      GlobalSearch,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
  });
  const fixture = TestBed.createComponent(GlobalSearch);
  fixture.detectChanges();
  await fixture.whenStable();
  const overlay = TestBed.inject(OverlayContainer).getContainerElement();
  return { fixture, overlay };
}

describe('GlobalSearch', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((element) => element.remove());
  });

  it('opens a read-only search overlay, focuses its field and restores focus after Escape', async () => {
    const { fixture, overlay } = await render();
    const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.global-search__compact',
    )!;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const input = overlay.querySelector<HTMLInputElement>('.global-search__modal input')!;
    expect(input.readOnly).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(overlay.textContent).toContain(en.shell.search.unavailable);

    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(overlay.querySelector('.global-search__modal')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps a selected category when compact search closes and reopens', async () => {
    const { fixture, overlay } = await render();
    const host = fixture.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLButtonElement>('.global-search__compact')!;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const category = overlay.querySelector<HTMLButtonElement>('.global-search__category')!;
    category.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const members = overlay.querySelector<HTMLButtonElement>(
      '[role="menu"] [role="menuitem"]:nth-child(3)',
    )!;
    members.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(overlay.querySelector('.global-search__category')?.textContent).toContain(
      en.shell.search.categories.members,
    );
    const categoryIcon = (
      getDebugNode(
        overlay.querySelector('.global-search__modal .global-search__category nw-icon')!,
      ) as DebugElement
    ).componentInstance as NwIcon;
    expect(categoryIcon.name()).toBe('users');

    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(overlay.querySelector('.global-search__category')?.textContent).toContain(
      en.shell.search.categories.members,
    );
  });
  it('synchronizes category tiles and dropdown, without unsupported Settings or fake results', async () => {
    const { fixture, overlay } = await render();
    const trigger = fixture.nativeElement.querySelector(
      '.global-search__compact',
    ) as HTMLButtonElement;
    trigger.click();
    await fixture.whenStable();
    const tiles = Array.from(
      overlay.querySelectorAll<HTMLInputElement>('.global-search__tile input'),
    );
    expect(tiles.map((tile) => tile.value)).toEqual([
      'all',
      'organizations',
      'members',
      'operators',
      'platforms',
    ]);
    const members = tiles.find((tile) => tile.value === 'members')!;
    members.click();
    await fixture.whenStable();
    expect(overlay.querySelector('.global-search__category')?.textContent).toContain(
      en.shell.search.categories.members,
    );
    expect(members.checked).toBe(true);
    expect(overlay.querySelector('.global-search__hint')?.textContent).not.toContain('Enter');
    (overlay.querySelector('.global-search__close') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(overlay.querySelector('.global-search__modal')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
  it('uses modal semantics and a focus trap, and closes on backdrop click', async () => {
    const { fixture, overlay } = await render();
    const trigger = fixture.nativeElement.querySelector(
      '.global-search__compact',
    ) as HTMLButtonElement;
    trigger.click();
    await fixture.whenStable();
    const dialog = overlay.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe(overlay.querySelector('h2')?.id);
    expect(overlay.querySelectorAll('.cdk-focus-trap-anchor')).toHaveLength(2);
    (overlay.querySelector('.cdk-overlay-backdrop') as HTMLElement).click();
    await fixture.whenStable();
    expect(overlay.querySelector('.global-search__modal')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('opens in the current RTL direction without creating a second category state', async () => {
    const previousDir = document.documentElement.dir;
    document.documentElement.dir = 'rtl';
    try {
      const { fixture, overlay } = await render();
      (fixture.nativeElement.querySelector('.global-search__compact') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(overlay.querySelector('[role="dialog"]')?.closest('[dir]')?.getAttribute('dir')).toBe(
        'rtl',
      );
      expect(overlay.querySelector<HTMLInputElement>('.global-search__tile input')?.checked).toBe(
        true,
      );
      fixture.destroy();
      expect(overlay.querySelector('.global-search__modal')).toBeNull();
    } finally {
      document.documentElement.dir = previousDir;
    }
  });
});
