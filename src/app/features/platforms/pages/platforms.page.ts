import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthSession } from '../../../core/auth/auth-session';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { NwButton } from '../../../shared/ui/button/button';
import { NwSkeleton } from '../../../shared/ui/skeleton/skeleton';
import { NwIcon } from '../../../shared/ui/icon/icon';
import { CreatePlatformAction } from '../application/create-platform.action';
import { PlatformDirectoryFacade } from '../application/platform-directory.facade';
import { PlatformCard } from '../components/platform-card/platform-card';
import { PlatformsHeader } from '../components/platforms-header/platforms-header';

/**
 * Platforms (`/platforms`): the owner's directory of the Company's Platforms, built to the owner's design
 * (claude.ai design "Platforms Screen", 2026-10-02). The directory shows all loaded platforms. Create platform is shown, disabled, with its explanation as a
 * tooltip on hover and keyboard focus (it stays focusable through `aria-disabled`).
 */
@Component({
  selector: 'adm-platforms-page',
  imports: [
    NgTemplateOutlet,
    TranslocoPipe,
    NwButton,
    NwIcon,
    NwSkeleton,
    PlatformCard,
    PlatformsHeader,
  ],
  templateUrl: './platforms.page.html',
  styleUrl: './platforms.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'platforms' },
})
export class PlatformsPage {
  protected readonly facade = inject(PlatformDirectoryFacade);
  protected readonly createPlatform = inject(CreatePlatformAction);
  protected readonly isDemo = inject(AuthSession).isDemo;

  protected readonly adapterUnavailable = ADAPTER_UNAVAILABLE;
  protected readonly skeletons = [0, 1];
}
