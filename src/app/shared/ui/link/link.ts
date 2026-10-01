import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Inline text link on a native anchor (`<a nw-link routerLink>` or `href`). For button-shaped links use `nw-button`. */
@Component({
  selector: 'a[nw-link]',
  template: '<ng-content />',
  styleUrl: './link.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'nw-link' },
})
export class NwLink {}
