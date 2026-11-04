import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwBrandMark } from '../../../../shared/ui/brand-mark/brand-mark';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/** Inherits resolved theme/accent tokens. No services, user data, routing or interactive controls. */
@Component({
  selector: 'adm-appearance-preview',
  imports: [TranslocoPipe, NwBrandMark, NwIcon],
  template: `
    <header class="appearance-preview__heading">
      <nw-icon name="eye" />
      <div>
        <h3>{{ 'settings.appearance.preview.title' | transloco }}</h3>
        <p>{{ 'settings.appearance.preview.description' | transloco }}</p>
      </div>
    </header>
    <figure
      class="appearance-preview__figure"
      role="img"
      [attr.aria-label]="'settings.appearance.preview.accessible' | transloco"
    >
      <div class="appearance-preview__dashboard" aria-hidden="true">
        <header class="appearance-preview__bar">
          <nw-brand-mark wordmark label="" /><span class="appearance-preview__avatar">NA</span>
        </header>
        <aside class="appearance-preview__sidebar">
          <span class="appearance-preview__active"
            ><nw-icon name="house" size="sm" />{{ 'shell.breadcrumb.overview' | transloco }}</span
          >
          <span
            ><nw-icon name="building-2" size="sm" />{{
              'shell.search.categories.organizations' | transloco
            }}</span
          >
          <span
            ><nw-icon name="users" size="sm" />{{
              'shell.search.categories.members' | transloco
            }}</span
          >
          <span><nw-icon name="settings" size="sm" />{{ 'settings.title' | transloco }}</span>
        </aside>
        <div class="appearance-preview__main">
          <strong>{{ 'settings.appearance.preview.sample' | transloco }}</strong>
          <div class="appearance-preview__metrics">
            @for (icon of icons; track icon) {
              <div>
                <nw-icon [name]="icon" /><b>—</b><span class="appearance-preview__line"></span>
              </div>
            }
          </div>
          <div class="appearance-preview__charts">
            <div class="appearance-preview__chart">
              @for (height of bars; track $index) {
                <span [style.block-size.%]="height"></span>
              }
            </div>
            <div class="appearance-preview__secondary">
              <span class="appearance-preview__ring"></span
              ><span class="appearance-preview__line"></span
              ><span class="appearance-preview__line"></span>
            </div>
          </div>
        </div>
      </div>
      <figcaption>{{ 'settings.appearance.preview.sample' | transloco }}</figcaption>
    </figure>
  `,
  styleUrl: './appearance-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearancePreview {
  protected readonly icons = ['users', 'building-2', 'chart-line'] as const;
  protected readonly bars = [25, 40, 34, 58, 46, 72, 64, 90];
}
