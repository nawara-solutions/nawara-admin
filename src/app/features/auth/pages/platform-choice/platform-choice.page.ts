import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../../core/auth/auth-session';
import { NwButton } from '../../../../shared/ui/button/button';
import { NwIcon } from '../../../../shared/ui/icon/icon';
import { NwInlineAlert } from '../../../../shared/ui/inline-alert/inline-alert';
import { NwSkeleton } from '../../../../shared/ui/skeleton/skeleton';
import { AuthFlowFacade } from '../../application/auth-flow.facade';
import { AuthCard } from '../../components/auth-card/auth-card';
import { IdentityRow } from '../../components/identity-row/identity-row';

const PRODUCT_KEYS = {
  school: 'auth.platform.school',
  drive: 'auth.platform.drive',
} as const;

/**
 * An operator assigned to several Platforms picks one (`/login/platform`). Only assigned Platforms are listed, with no
 * counts or Company-wide figures. The ids come from grants; the names have no human Core route yet (CF-02), so they come
 * from the scope directory (mock in demo builds). Opening one is navigation; Core checks access to it.
 */
@Component({
  selector: 'adm-platform-choice-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    NwButton,
    NwIcon,
    NwInlineAlert,
    NwSkeleton,
    AuthCard,
    IdentityRow,
  ],
  templateUrl: './platform-choice.page.html',
  styleUrl: './platform-choice.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platform-choice' },
})
export class PlatformChoicePage {
  protected readonly flow = inject(AuthFlowFacade);
  protected readonly actor = inject(AuthSession).actor;
  protected readonly productKeys = PRODUCT_KEYS;
  protected readonly platforms = toSignal(this.flow.assignedPlatforms(), {
    initialValue: { status: 'loading' } as const,
  });
}
