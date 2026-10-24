import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import {
  CORE_SERVICE_NAME_KEYS,
  CORE_SERVICE_RESPONSIBILITY_KEYS,
} from '../../../core/core-services/core-service-labels';
import { NwButton } from '../../../shared/ui/button/button';
import { NwDataState } from '../../../shared/ui/data-state/data-state';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { ServicesFacade } from '../application/services.facade';

/**
 * Services & health (`/services`; P8 design, artboard Services): the Company owner's inventory of Nawara Core's
 * services and their documented responsibilities, with live health stated plainly as unavailable (CF-06). A
 * documentation page, not a monitoring dashboard: no status colour, uptime, latency, incident, version or refresh.
 */
@Component({
  selector: 'adm-services-page',
  imports: [TranslocoPipe, NwButton, NwDataState, NwIcon],
  templateUrl: './services.page.html',
  styleUrl: './services.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'services' },
})
export class ServicesPage {
  protected readonly facade = inject(ServicesFacade);
  protected readonly isDemo = inject(AuthSession).isDemo;
  protected readonly nameKeys = CORE_SERVICE_NAME_KEYS;
  protected readonly responsibilityKeys = CORE_SERVICE_RESPONSIBILITY_KEYS;
}
