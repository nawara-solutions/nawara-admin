import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { LocaleService } from '../../../core/i18n/locale.service';
import { NwButton } from '../../../shared/ui/button/button';
import { NwSkeleton } from '../../../shared/ui/skeleton/skeleton';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { PlatformDirectoryFacade } from '../application/platform-directory.facade';
import { PlatformCard } from '../components/platform-card/platform-card';
import { PlatformsHeader } from '../components/platforms-header/platforms-header';

const PRODUCT_KEYS = {
  school: 'platforms.product.school',
  drive: 'platforms.product.drive',
  unknown: 'platforms.product.unknown',
} as const;

/** The live count, by CLDR plural category (Arabic uses all six; English and French two). */
const COUNT_KEYS = {
  zero: 'platforms.count.zero',
  one: 'platforms.count.one',
  two: 'platforms.count.two',
  few: 'platforms.count.few',
  many: 'platforms.count.many',
  other: 'platforms.count.other',
} as const satisfies Record<Intl.LDMLPluralRule, string>;

/**
 * Platforms (`/platforms`): the owner's directory of the Company's Platforms, built to the owner's design
 * (claude.ai design "Platforms Screen", 2026-10-02). Search filters the loaded list by name and product type and
 * requests nothing; the count is announced politely. Create platform is shown, disabled, with its explanation as a
 * tooltip on hover and keyboard focus (it stays focusable through `aria-disabled`).
 */
@Component({
  selector: 'adm-platforms-page',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    NwButton,
    NwIcon,
    NwSkeleton,
    PlatformCard,
    PlatformsHeader,
  ],
  templateUrl: './platforms.page.html',
  styleUrl: './platforms.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platforms' },
})
export class PlatformsPage {
  protected readonly facade = inject(PlatformDirectoryFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  private readonly transloco = inject(TranslocoService);
  private readonly locale = inject(LocaleService).locale;
  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  protected readonly adapterUnavailable = ADAPTER_UNAVAILABLE;
  protected readonly query = signal('');
  protected readonly skeletons = [0, 1];

  protected readonly matches = computed(() => {
    const state = this.facade.state();
    if (state.status !== 'success') return [];
    this.lang();
    const q = this.query().trim().toLocaleLowerCase();
    if (!q) return state.data;
    return state.data.filter((entry) => {
      const product = this.transloco.translate(PRODUCT_KEYS[entry.platform.product ?? 'unknown']);
      return [entry.platform.name, product].some((text) => text.toLocaleLowerCase().includes(q));
    });
  });

  protected readonly countKey = computed(
    () => COUNT_KEYS[new Intl.PluralRules(this.locale()).select(this.matches().length)],
  );

  protected onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }
}
