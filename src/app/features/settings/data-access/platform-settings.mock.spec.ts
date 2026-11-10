import { TestBed } from '@angular/core/testing';
import { DemoWorld } from '../../../demo/world/demo-world';
import {
  PlatformSettingsGateway,
  UnavailablePlatformSettingsGateway,
} from './platform-settings.gateway';
import { MockPlatformSettingsGateway } from './platform-settings.mock';

describe('platform settings adapters (read only, WP-1.1; no policy, WP-2.2)', () => {
  it('only says whether the Platform section shows: available in demo builds, not otherwise', () => {
    expect(new MockPlatformSettingsGateway().available).toBe(true);
    expect(new UnavailablePlatformSettingsGateway().available).toBe(false);
  });

  it('holds no assisted-payments value, offers no way to change one, and leaves the demo world untouched', () => {
    TestBed.configureTestingModule({ providers: [MockPlatformSettingsGateway] });
    const world = TestBed.inject(DemoWorld);
    const before = world.snapshot();
    const gateway = TestBed.inject(MockPlatformSettingsGateway);
    for (const adapter of [gateway, new UnavailablePlatformSettingsGateway()]) {
      expect(adapter).toBeInstanceOf(PlatformSettingsGateway);
      for (const member of ['policies', 'setAssistedPayments', 'eligibility'])
        expect(member in adapter, member).toBe(false);
      expect(Object.keys(adapter)).toEqual(['available']);
    }
    expect(world.snapshot()).toBe(before);
  });
});
