import { A11yModule } from '@angular/cdk/a11y';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
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

/** Below the trigger, aligned to its end edge (start edge as fallback); CDK mirrors these in RTL. */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
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
