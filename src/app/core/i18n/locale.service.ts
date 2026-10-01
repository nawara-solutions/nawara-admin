import { Directionality } from '@angular/cdk/bidi';
import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { PreferenceStore } from '../preferences/preference-store';
import { DEFAULT_LOCALE, Direction, Locale, directionOf, isLocale } from './locale';

/**
 * The UI locale and its direction (docs/ARCHITECTURE.md §16, §17). Switching loads the catalog first, then updates
 * Transloco, `<html lang dir>` and CDK `Directionality` together, without a reload. Core's `Accept-Language` follows it from A3 (interceptor).
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly transloco = inject(TranslocoService);
  private readonly store = inject(PreferenceStore);
  private readonly document = inject(DOCUMENT);
  private readonly directionality = inject(Directionality);
  private readonly current = signal<Locale>(DEFAULT_LOCALE);

  readonly locale = this.current.asReadonly();
  readonly direction = computed<Direction>(() => directionOf(this.current()));

  constructor() {
    effect(() => {
      const root = this.document.documentElement;
      root.lang = this.current();
      root.dir = this.direction();
    });
    // CDK reads the document direction only once; keep overlays, menus and dialogs in step with the locale.
    effect(() => {
      const direction = this.direction();
      if (this.directionality.value === direction) return;
      this.directionality.valueSignal.set(direction);
      this.directionality.change.emit(direction);
    });
  }

  /** Loads the stored or first-visit locale before the first render. */
  initialize(): Promise<void> {
    return this.activate(this.initialLocale());
  }

  async use(locale: Locale): Promise<void> {
    await this.activate(locale);
    this.store.write('locale', locale);
  }

  private async activate(locale: Locale): Promise<void> {
    await firstValueFrom(this.transloco.load(locale));
    this.transloco.setActiveLang(locale);
    this.current.set(locale);
  }

  private initialLocale(): Locale {
    const stored = this.store.read('locale');
    if (isLocale(stored)) return stored;
    const browser = this.document.defaultView?.navigator.languages ?? [];
    for (const tag of browser) {
      const language = tag.toLowerCase().split('-')[0];
      if (isLocale(language)) return language;
    }
    return DEFAULT_LOCALE;
  }
}
