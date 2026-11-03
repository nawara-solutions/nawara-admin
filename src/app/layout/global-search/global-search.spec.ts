import { OverlayContainer } from '@angular/cdk/overlay';
import { By } from '@angular/platform-browser';
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

    const input = overlay.querySelector<HTMLInputElement>('.global-search__popover input')!;
    expect(input.readOnly).toBe(true);
    expect(document.activeElement).toBe(input);
    expect(overlay.textContent).toContain(en.shell.search.unavailable);

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
    expect(overlay.querySelector('.global-search__popover')).toBeNull();
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
    const categoryIcon = fixture.debugElement.query(
      By.css('.global-search__field--popover .global-search__category nw-icon'),
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
});
