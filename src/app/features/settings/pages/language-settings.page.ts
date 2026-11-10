import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  LOCALES,
  LOCALE_ENDONYMS,
  Locale,
  directionOf,
  formattingLocaleOf,
} from '../../../core/i18n/locale';
import { LocaleService } from '../../../core/i18n/locale.service';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { NwButton } from '../../../shared/ui/button/button';
import { LanguagePreview } from '../components/language-preview/language-preview';

/** Browser-local draft; only Apply commits through the same service as the top-bar menu. */
@Component({
  selector: 'adm-language-settings-page',
  imports: [TranslocoPipe, NwIcon, NwButton, LanguagePreview],
  templateUrl: './language-settings.page.html',
  styleUrl: './language-settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'language-settings' },
})
export class LanguageSettingsPage {
  protected readonly locale = inject(LocaleService);
  protected readonly selected = signal<Locale>(this.locale.locale());
  protected readonly applying = signal(false);
  protected readonly failed = signal(false);
  protected readonly dirty = computed(() => this.selected() !== this.locale.locale());
  protected readonly direction = computed(() => directionOf(this.selected()));
  protected readonly date = computed(() =>
    new Intl.DateTimeFormat(formattingLocaleOf(this.selected()), {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(2026, 10, 5)),
  );
  protected readonly number = computed(() =>
    new Intl.NumberFormat(formattingLocaleOf(this.selected())).format(1234.56),
  );
  protected readonly options = LOCALES.map((value) => ({
    value,
    name: LOCALE_ENDONYMS[value],
    direction: directionOf(value),
    directionKey: directionOf(value) === 'rtl' ? 'settings.language.rtl' : 'settings.language.ltr',
    sample: { en: 'Aa', fr: 'Àé', ar: 'أب' }[value],
    labelKey: {
      en: 'settings.language.names.en',
      fr: 'settings.language.names.fr',
      ar: 'settings.language.names.ar',
    }[value],
  }));

  constructor() {
    // An external top-bar selection supersedes any uncommitted page draft.
    effect(() => this.selected.set(this.locale.locale()));
  }

  protected choose(value: Locale): void {
    this.selected.set(value);
    this.failed.set(false);
  }

  protected discard(): void {
    this.selected.set(this.locale.locale());
    this.failed.set(false);
  }

  protected async apply(): Promise<void> {
    if (!this.dirty() || this.applying()) return;
    this.applying.set(true);
    this.failed.set(false);
    try {
      await this.locale.use(this.selected());
    } catch {
      this.failed.set(true);
    } finally {
      this.applying.set(false);
    }
  }
}
