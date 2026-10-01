import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Renderer2,
  afterRenderEffect,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { NW_ICONS, NwIconName } from './icon.registry';

const SVG_NS = 'svg';

/**
 * Inline SVG icon (docs/ARCHITECTURE.md §26). Decorative by default: the accessible name belongs to the control
 * that contains it. Colour follows `currentColor`.
 */
@Component({
  selector: 'nw-icon',
  template: `<svg
    #svg
    class="nw-icon__svg"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    focusable="false"
  ></svg>`,
  styleUrl: './icon.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'nw-icon',
    'aria-hidden': 'true',
    '[class.nw-icon--sm]': "size() === 'sm'",
    '[class.nw-icon--lg]': "size() === 'lg'",
    '[class.nw-icon--directional]': 'definition().directional',
  },
})
export class NwIcon {
  readonly name = input.required<NwIconName>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  protected readonly definition = computed(() => NW_ICONS[this.name()]);
  private readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');

  constructor() {
    const renderer = inject(Renderer2);
    afterRenderEffect({
      write: () => {
        const svg = this.svg().nativeElement;
        for (const child of Array.from(svg.childNodes)) renderer.removeChild(svg, child);
        for (const [tag, attributes] of this.definition().node) {
          const element: Element = renderer.createElement(tag, SVG_NS);
          for (const [attribute, value] of Object.entries(attributes)) {
            if (value !== undefined) renderer.setAttribute(element, attribute, String(value));
          }
          renderer.appendChild(svg, element);
        }
      },
    });
  }
}
