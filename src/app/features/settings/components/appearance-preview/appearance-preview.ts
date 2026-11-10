import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NwBrandMark } from '../../../../shared/ui/brand-mark/brand-mark';
import { NwIcon } from '../../../../shared/ui/icon/icon';

/** Inherits resolved theme/accent tokens. No services, user data, routing or interactive controls. */
@Component({
  selector: 'adm-appearance-preview',
  imports: [TranslocoPipe, NwBrandMark, NwIcon],
  template: `
    <figure
      class="appearance-preview__figure"
      role="img"
      [attr.aria-label]="'settings.appearance.preview.accessible' | transloco"
    >
      <div class="appearance-preview__dashboard" aria-hidden="true">
        <header class="appearance-preview__bar">
          <nw-brand-mark wordmark symbolFirst label="" />
          <span class="appearance-preview__live-label">
            <span aria-hidden="true"></span>
            {{ 'settings.appearance.preview.title' | transloco }}
          </span>
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
          <strong class="appearance-preview__title">{{
            'settings.appearance.preview.overview' | transloco
          }}</strong>
          <span class="appearance-preview__line"></span>
          <div class="appearance-preview__metrics">
            @for (metric of metrics; track metric.key) {
              <div>
                <nw-icon [name]="metric.icon" /><b>—</b><span>{{ metric.key | transloco }}</span>
              </div>
            }
          </div>
          <div class="appearance-preview__charts">
            <div class="appearance-preview__chart">
              <svg viewBox="0 0 240 110" aria-hidden="true" focusable="false">
                @for (height of bars; track $index) {
                  <rect
                    [attr.x]="$index * 30"
                    [attr.y]="105 - height"
                    width="22"
                    [attr.height]="height"
                    rx="4"
                  />
                }
              </svg>
            </div>
            <div class="appearance-preview__secondary">
              <span class="appearance-preview__ring"></span
              ><span class="appearance-preview__line"></span
              ><span class="appearance-preview__line"></span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  `,
  styleUrl: './appearance-preview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppearancePreview {
  protected readonly metrics = [
    { icon: 'users', key: 'shell.search.categories.members' },
    { icon: 'building-2', key: 'shell.search.categories.organizations' },
    { icon: 'user-round', key: 'shell.search.categories.operators' },
  ] as const;
  protected readonly bars = [25, 40, 34, 58, 46, 72, 64, 90];
}
