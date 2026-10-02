import { Injectable, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { LocaleService } from './locale.service';

/**
 * Localized document titles (docs/ARCHITECTURE.md §6, §25): a route's `title` is a catalog key, rendered as
 * "<page> · Nawara Admin" and re-rendered when the language changes.
 */
@Injectable({ providedIn: 'root' })
export class LocalizedTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private key: string | undefined;

  constructor() {
    super();
    toObservable(inject(LocaleService).locale).subscribe(() => this.apply());
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.key = this.buildTitle(snapshot);
    this.apply();
  }

  private apply(): void {
    const app = this.transloco.translate('titles.app');
    this.title.setTitle(this.key ? `${this.transloco.translate(this.key)} · ${app}` : app);
  }
}
