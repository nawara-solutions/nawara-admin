import { TestBed } from '@angular/core/testing';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DEMO_DRIVE_PLATFORM_ID, DEMO_SCHOOL_PLATFORM_ID } from '../../../demo/world/seed';
import {
  PlatformSettingsGateway,
  UnavailablePlatformSettingsGateway,
} from './platform-settings.gateway';
import { MockPlatformSettingsGateway } from './platform-settings.mock';

describe('platform settings demo adapter (read only, WP-1.1)', () => {
  it("reads each Platform's assisted-payments policy from the demo world", () => {
    TestBed.configureTestingModule({ providers: [MockPlatformSettingsGateway] });
    const gateway = TestBed.inject(MockPlatformSettingsGateway);
    const expected = new Map(
      TestBed.inject(DemoWorld)
        .snapshot()
        .platformCommercial.map(
          (record) => [record.platformId, record.assistedPayments === 'enabled'] as const,
        ),
    );
    expect(gateway.available).toBe(true);
    expect(gateway.policies()).toEqual(expected);
    expect(gateway.policies().get(DEMO_SCHOOL_PLATFORM_ID)).toBe(true);
    expect(gateway.policies().get(DEMO_DRIVE_PLATFORM_ID)).toBe(false);
  });

  it('offers no way to change the policy, and reading it leaves the demo world untouched', () => {
    TestBed.configureTestingModule({ providers: [MockPlatformSettingsGateway] });
    const world = TestBed.inject(DemoWorld);
    const before = world.snapshot();
    const gateway = TestBed.inject(MockPlatformSettingsGateway);
    gateway.policies();
    for (const adapter of [gateway, new UnavailablePlatformSettingsGateway()]) {
      expect('setAssistedPayments' in adapter).toBe(false);
      expect(adapter).toBeInstanceOf(PlatformSettingsGateway);
    }
    expect(world.snapshot()).toBe(before);
  });
});
