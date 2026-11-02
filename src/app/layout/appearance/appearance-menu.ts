import { A11yModule } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ViewportRuler } from '@angular/cdk/scrolling';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../core/theme/theme.service';
import { NwIcon } from '../../shared/ui/icon/icon';
import { AppearancePanel } from './appearance-panel';

const MODE_ICONS = { light: 'sun', dark: 'moon', system: 'monitor' } as const;

/**
 * Below the trigger, aligned to its end edge (start edge as fallback), 8 px away; CDK mirrors these in RTL. A 12 px
 * viewport margin and `push` keep it on screen horizontally on narrow viewports; its height is capped to the room below
 * the trigger (measured on open and on resize), and it scrolls inside beyond that.
 */
const GAP = 8;
const VIEWPORT_MARGIN = 12;
/** Below this the popover would be unusable; the page scrolls instead (a phone in landscape with the keyboard up). */
const MIN_HEIGHT = 160;
const POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: GAP },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: GAP },
];

/**
 * The compact Appearance control: one button (the current mode's icon and the accent swatch) that opens a non-modal
 * popover with the Appearance panel. Focus moves into the popover and is kept there; Escape or a click outside closes it
 * and focus returns to the button. Used beside the language control on the sign-in pages and in the top bar.
 */
@Component({
  selector: 'adm-appearance-menu',
  imports: [
    A11yModule,
    CdkConnectedOverlay,
    CdkOverlayOrigin,
    TranslocoPipe,
    NwIcon,
    AppearancePanel,
  ],
  templateUrl: './appearance-menu.html',
  styleUrl: './appearance-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'appearance-menu', '[class.appearance-menu--framed]': 'framed()' },
})
export class AppearanceMenu {
  /** The outlined variant of the sign-in pages. */
  readonly framed = input(false, { transform: booleanAttribute });

  protected readonly theme = inject(ThemeService);
  protected readonly open = signal(false);
  protected readonly positions = POSITIONS;
  protected readonly modeIcon = computed(() => MODE_ICONS[this.theme.preference()]);
  /** The room between the trigger's bottom edge and the viewport's (minus the gap and the margin), in px. */
  protected readonly maxHeight = signal<number | null>(null);
  private trigger: HTMLElement | null = null;

  constructor() {
    // A resize or rotation while open re-measures, so the popover never runs past the bottom edge.
    inject(ViewportRuler)
      .change(100)
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        if (this.open() && this.trigger) this.measure(this.trigger);
      });
  }

  protected measure(trigger: HTMLElement): void {
    this.trigger = trigger;
    const view = trigger.ownerDocument.defaultView;
    if (!view) return;
    const room = view.innerHeight - trigger.getBoundingClientRect().bottom - GAP - VIEWPORT_MARGIN;
    this.maxHeight.set(Math.max(MIN_HEIGHT, Math.floor(room)));
  }

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected close(): void {
    this.open.set(false);
  }

  protected onOutsideClick(event: MouseEvent, trigger: HTMLElement): void {
    // A click on the trigger toggles; it must not also count as "outside".
    if (!trigger.contains(event.target as Node)) this.close();
  }
}
