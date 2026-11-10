import { computed, inject, Provider } from '@angular/core';
import { DemoWorld } from '../../../demo/world/demo-world';
import { PlatformSettingsGateway } from './platform-settings.gateway';

/** Demo adapter: reads the demo world's Platform assisted-payments policies; it never changes them (WP-1.1). */
export class MockPlatformSettingsGateway extends PlatformSettingsGateway {
  private readonly world = inject(DemoWorld);
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
}
export const MOCK_PLATFORM_SETTINGS_PROVIDERS: readonly Provider[] = [
  { provide: PlatformSettingsGateway, useClass: MockPlatformSettingsGateway },
];
