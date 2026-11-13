import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import {
  AccentPalette,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  ThemePreference,
  ThemeService,
} from '../../core/theme/theme.service';
import { NwToastService } from '../../shared/ui/toast/toast.service';

export interface AppearancePreference {
  readonly mode: ThemePreference;
  readonly accent: AccentPalette;
  readonly density: number;
}

/** One disposable editor per panel, sharing committed state and persistence through ThemeService. */
@Injectable()
export class AppearanceDraft {
  private readonly committed = inject(ThemeService);
  private readonly toasts = inject(NwToastService);
  private readonly translate = inject(TranslocoService);
  private readonly value = signal<AppearancePreference>({
    mode: this.committed.preference(),
    accent: this.committed.accent(),
    density: this.committed.density(),
  });
  readonly preference = computed(() => this.value().mode);
  readonly accent = computed(() => this.value().accent);
  readonly density = computed(() => this.value().density);
  readonly resolved = computed(() => this.committed.resolvePreference(this.preference()));
  readonly dirty = computed(
    () =>
      this.preference() !== this.committed.preference() ||
      this.accent() !== this.committed.accent() ||
      this.density() !== this.committed.density(),
  );
  readonly customized = computed(
    () =>
      this.preference() !== DEFAULT_THEME ||
      this.accent() !== DEFAULT_ACCENT ||
      this.density() !== 3,
  );
  readonly applying = signal(false);

  constructor() {
    effect(() => {
      const next = {
        mode: this.committed.preference(),
        accent: this.committed.accent(),
        density: this.committed.density(),
      };
      untracked(() => this.value.set(next));
    });
  }
  setPreference(mode: ThemePreference): void {
    if (this.applying()) return;
    this.value.update((current) => ({ ...current, mode }));
  }
  setAccent(accent: AccentPalette): void {
    if (this.applying()) return;
    this.value.update((current) => ({ ...current, accent }));
  }
  setDensity(density: number): void {
    if (!this.applying() && Number.isInteger(density) && density >= 1 && density <= 5)
      this.value.update((current) => ({ ...current, density }));
  }
  discard(): void {
    if (!this.applying())
      this.value.set({
        mode: this.committed.preference(),
        accent: this.committed.accent(),
        density: this.committed.density(),
      });
  }
  reset(): void {
    if (this.applying()) return;
    this.value.set({ mode: DEFAULT_THEME, accent: DEFAULT_ACCENT, density: 3 });
  }
  async apply(): Promise<void> {
    if (!this.dirty() || this.applying()) return;
    const next = this.value();
    this.applying.set(true);
    let saved = false;
    try {
      saved = await this.committed.applyAppearance(next.mode, next.accent, next.density);
    } catch {
      // Keep the editor recoverable if asset preparation fails unexpectedly.
    } finally {
      this.applying.set(false);
    }
    if (!saved) {
      this.toasts.show(this.translate.translate('preferences.appearance.saveFailed'), {
        tone: 'danger',
      });
    }
  }
}
