import { computed, inject, Provider } from '@angular/core';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import { PlatformId } from '../../../core/context/scope.model';
import { DemoWorld } from '../../../demo/world/demo-world';
import { PlatformSettingsGateway } from './platform-settings.gateway';

export class MockPlatformSettingsGateway extends PlatformSettingsGateway {
  private readonly world = inject(DemoWorld);
  private readonly auth = inject(DemoAuthState);
  readonly available = true;
  readonly policies = computed(
    () =>
      new Map(
        this.world
          .snapshot()
          .platformCommercial.map(
            (record) => [record.platformId, record.assistedPayments === 'enabled'] as const,
          ),
      ),
  );

  setAssistedPayments(platform: PlatformId, enabled: boolean): boolean {
    const session = this.auth.signedIn();
    const world = this.world.snapshot();
    if (
      !session ||
      session.businessIdentityId !== world.company.ownerId ||
      !world.platformCommercial.some((record) => record.platformId === platform)
    )
      return false;
    return this.world.commit((current) => ({
      ok: true,
      world: {
        ...current,
        platformCommercial: current.platformCommercial.map((record) =>
          record.platformId === platform
            ? { ...record, assistedPayments: enabled ? 'enabled' : 'disabled' }
            : record,
        ),
      },
      result: true,
    })).ok;
  }
}
export const MOCK_PLATFORM_SETTINGS_PROVIDERS: readonly Provider[] = [
  { provide: PlatformSettingsGateway, useClass: MockPlatformSettingsGateway },
];
