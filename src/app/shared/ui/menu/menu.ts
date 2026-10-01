import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  Directive,
  booleanAttribute,
  input,
} from '@angular/core';

/**
 * Menu on CDK Menu (ARIA menu pattern: roving focus, arrow keys, typeahead, Escape, RTL-aware placement).
 *
 *   <button nw-button [nwMenuTriggerFor]="actions">…</button>
 *   <ng-template #actions><nw-menu><button nw-menu-item (triggered)="edit()">…</button></nw-menu></ng-template>
 */
@Directive({
  selector: '[nwMenuTriggerFor]',
  hostDirectives: [{ directive: CdkMenuTrigger, inputs: ['cdkMenuTriggerFor: nwMenuTriggerFor'] }],
})
export class NwMenuTrigger {}

@Component({
  selector: 'nw-menu',
  template: '<ng-content />',
  styleUrl: './menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [CdkMenu],
  host: { class: 'nw-menu' },
})
export class NwMenu {}

@Component({
  selector: 'button[nw-menu-item]',
  template: '<ng-content />',
  styleUrl: './menu-item.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [{ directive: CdkMenuItem, outputs: ['cdkMenuItemTriggered: triggered'] }],
  host: { class: 'nw-menu-item', type: 'button', '[class.nw-menu-item--danger]': 'danger()' },
})
export class NwMenuItem {
  /** Destructive item: shown in the danger colour (with its own text label, never colour alone). */
  readonly danger = input(false, { transform: booleanAttribute });
}
