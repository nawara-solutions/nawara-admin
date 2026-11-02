import { CdkConnectedOverlay, OverlayContainer } from '@angular/cdk/overlay';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import en from '../../../i18n/en.json';
import { AppearanceMenu } from './appearance-menu';

async function render() {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
  }));
  TestBed.configureTestingModule({
    imports: [
      AppearanceMenu,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
  });
  const fixture = TestBed.createComponent(AppearanceMenu);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await fixture.whenStable();
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  };
  const overlay = TestBed.inject(OverlayContainer).getContainerElement();
  const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    '.appearance-menu__trigger',
  )!;
  const escape = async (target: Element) => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await settle();
  };
  return { fixture, settle, overlay, trigger, escape };
}

describe('AppearanceMenu', () => {
  afterEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('anchors the popover under its trigger and keeps it inside the viewport', async () => {
    const { fixture } = await render();
    // The directive sits on an <ng-template> (a comment node), so query nodes rather than elements.
    const [node] = fixture.debugElement.queryAllNodes(By.directive(CdkConnectedOverlay));
    const connected = node!.injector.get(CdkConnectedOverlay);
    // End-aligned below the trigger (CDK mirrors it in RTL), start-aligned as the fallback, 8 px away.
    expect(connected.positions.map((p) => [p.originX, p.overlayX, p.offsetY])).toEqual([
      ['end', 'end', 8],
      ['start', 'start', 8],
    ]);
    // Narrow viewports: pushed back on screen with a margin instead of overflowing.
    expect(connected.viewportMargin).toBe(12);
    expect(connected.push).toBe(true);
  });

  it('closes the accent list first on Escape, then the popover, focus returning step by step', async () => {
    const { trigger, overlay, settle, escape } = await render();
    trigger.click();
    await settle();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const popover = overlay.querySelector('.appearance-menu__popover');
    expect(popover?.getAttribute('role')).toBe('dialog');

    const selector = overlay.querySelector<HTMLButtonElement>('.accent-picker__trigger')!;
    selector.click();
    await settle();
    const search = overlay.querySelector<HTMLInputElement>('.accent-picker__input')!;
    expect(document.activeElement).toBe(search);

    await escape(search);
    expect(overlay.querySelector('.accent-picker__panel')).toBeNull();
    expect(overlay.querySelector('.appearance-menu__popover')).not.toBeNull();
    expect(document.activeElement).toBe(selector);

    await escape(selector);
    expect(overlay.querySelector('.appearance-menu__popover')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('a click inside the accent list does not close the popover', async () => {
    const { trigger, overlay, settle } = await render();
    trigger.click();
    await settle();
    overlay.querySelector<HTMLButtonElement>('.accent-picker__trigger')!.click();
    await settle();
    const list = overlay.querySelector<HTMLElement>('[role=listbox]')!;
    list.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    list.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await settle();
    expect(overlay.querySelector('.appearance-menu__popover')).not.toBeNull();
    expect(overlay.querySelector('.accent-picker__panel')).not.toBeNull();
  });
});
