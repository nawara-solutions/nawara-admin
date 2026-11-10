import { Provider } from '@angular/core';
import { PlatformSettingsGateway } from './platform-settings.gateway';

/**
 * Demo adapter: the Platform section is shown in demo builds. It reads no assisted-payments value: the demo world's old
 * flags are never presented as a policy or as eligibility (WP-2.2), and nothing is ever changed (WP-1.1).
 */
export class MockPlatformSettingsGateway extends PlatformSettingsGateway {
  readonly available = true;
}
export const MOCK_PLATFORM_SETTINGS_PROVIDERS: readonly Provider[] = [
  { provide: PlatformSettingsGateway, useClass: MockPlatformSettingsGateway },
];
