import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { ReleasesFacade } from '../application/releases.facade';
import { ReleaseCapability, ReleaseCapabilityStatus } from '../domain/release-information.model';

/** Catalog keys, listed in full (never built at runtime). */
const CAPABILITY_KEYS = {
  catalog: { title: 'releases.capability.catalog.title', body: 'releases.capability.catalog.body' },
  publish: { title: 'releases.capability.publish.title', body: 'releases.capability.publish.body' },
  withdraw: {
    title: 'releases.capability.withdraw.title',
    body: 'releases.capability.withdraw.body',
  },
  minimumVersion: {
    title: 'releases.capability.minimumVersion.title',
    body: 'releases.capability.minimumVersion.body',
  },
} as const satisfies Record<ReleaseCapability, { readonly title: string; readonly body: string }>;

const STATUS_KEYS = {
  notAvailable: 'releases.status.notAvailable',
  ciOnly: 'releases.status.ciOnly',
  notInAdmin: 'releases.status.notInAdmin',
} as const satisfies Record<ReleaseCapabilityStatus, string>;

/**
 * Releases (`/releases`; P8 design, artboard Releases): the Company owner's information page about Nawara Core's
 * Release service. Not a release catalog or deployment console: no release, version, compatibility value, deployment
 * state or URL is shown, and there is no control (enabled or disabled) to publish, withdraw or change a version.
 */
@Component({
  selector: 'adm-releases-page',
  imports: [TranslocoPipe, NwButton, NwDataState, NwIcon],
  templateUrl: './releases.page.html',
  styleUrl: './releases.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'releases' },
})
export class ReleasesPage {
  protected readonly facade = inject(ReleasesFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly capabilityKeys = CAPABILITY_KEYS;
  protected readonly statusKeys = STATUS_KEYS;
}
