import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  booleanAttribute,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwIconName } from '../../../../shared/ui/icon/icon.registry';

export type AuthCardTone = 'brand' | 'purple' | 'danger';

let nextId = 0;

/**
 * The focused card of every sign-in page (A4 design): optional icon badge, the page's only `h1`, a subtitle, then the
 * projected banner and body. Focus moves to the heading whenever `step` changes (and on first render), so a screen
 * reader hears where it is after each route or step change (docs/ARCHITECTURE.md §25).
 */
@Component({
  selector: 'adm-auth-card',
  imports: [NwIcon],
  template: `
    <div class="auth-card__head">
      @if (icon(); as name) {
        <span
          class="auth-card__badge"
          [class.auth-card__badge--purple]="tone() === 'purple'"
          [class.auth-card__badge--danger]="tone() === 'danger'"
        >
          <nw-icon [name]="name" />
        </span>
      }
      <h1 #heading class="auth-card__title" tabindex="-1" [id]="titleId">{{ title() }}</h1>
      @if (subtitle(); as text) {
        <p class="auth-card__subtitle">{{ text }}</p>
      }
    </div>
    <ng-content />
  `,
  styleUrl: './auth-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'auth-card',
    role: 'region',
    '[attr.aria-labelledby]': 'titleId',
    '[class.auth-card--wide]': 'wide()',
    '[class.auth-card--centered]': 'centered()',
  },
})
export class AuthCard {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly icon = input<NwIconName>();
  readonly tone = input<AuthCardTone>('brand');
  /** The platform choice uses a wider card. */
  readonly wide = input(false, { transform: booleanAttribute });
  /** Centres the heading and the content (a step with nothing to act on). */
  readonly centered = input(false, { transform: booleanAttribute });
  /** A change of value is a step change: focus returns to the heading. */
  readonly step = input<string>('');

  protected readonly titleId = `auth-card-title-${nextId++}`;
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  constructor() {
    const injector = inject(Injector);
    effect(() => {
      this.step();
      afterNextRender(() => this.heading().nativeElement.focus({ preventScroll: true }), {
        injector,
      });
    });
  }
}
