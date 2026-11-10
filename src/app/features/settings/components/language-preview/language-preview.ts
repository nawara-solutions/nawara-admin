import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Locale, directionOf } from '../../../../core/i18n/locale';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwBrandMark } from '../../../../shared/ui/brand-mark/brand-mark';

/** Static sample content translated independently of the committed application locale. */
@Component({
  selector: 'adm-language-preview',
  imports: [TranslocoPipe, NwIcon, NwBrandMark],
  templateUrl: './language-preview.html',
  styleUrl: './language-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LanguagePreview {
  readonly locale = input.required<Locale>();
  readonly date = input.required<string>();
  protected readonly direction = computed(() => directionOf(this.locale()));
  protected readonly navigation = [
    { icon: 'house', key: 'shell.breadcrumb.overview' },
    { icon: 'building-2', key: 'shell.search.categories.organizations' },
    { icon: 'users', key: 'shell.search.categories.members' },
    { icon: 'settings', key: 'settings.title' },
  ] as const;
  protected readonly nameKey = computed(
    () =>
      ({
        en: 'settings.language.names.en',
        fr: 'settings.language.names.fr',
        ar: 'settings.language.names.ar',
      })[this.locale()],
  );
  protected readonly metrics = [
    'shell.search.categories.members',
    'shell.search.categories.organizations',
    'shell.search.categories.operators',
  ];
}
