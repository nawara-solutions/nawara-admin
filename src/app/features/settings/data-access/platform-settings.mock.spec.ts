import { TestBed } from '@angular/core/testing';
import { DEMO_ACCOUNTS } from '../../../core/auth/auth.fixtures';
import { DemoAuthState } from '../../../core/auth/auth.mock-state';
import {
  DEMO_DRIVE_PLATFORM_ID,
  DEMO_OWNER_ID,
  DEMO_SCHOOL_PLATFORM_ID,
} from '../../../demo/world/seed';
import { MockPlatformSettingsGateway } from './platform-settings.mock';

describe('platform settings demo adapter', () => {
  it('changes only the selected platform and refuses a signed-out change', () => {
    TestBed.configureTestingModule({ providers: [MockPlatformSettingsGateway] });
    const auth = TestBed.inject(DemoAuthState);
    const gateway = TestBed.inject(MockPlatformSettingsGateway);
    auth.setSession(null);
    expect(gateway.setAssistedPayments(DEMO_SCHOOL_PLATFORM_ID, false)).toBe(false);
    auth.setSession({ identity: DEMO_ACCOUNTS[0]!.identity, businessIdentityId: DEMO_OWNER_ID });
    const drive = gateway.policies().get(DEMO_DRIVE_PLATFORM_ID);
    expect(gateway.setAssistedPayments(DEMO_SCHOOL_PLATFORM_ID, false)).toBe(true);
    expect(gateway.policies().get(DEMO_SCHOOL_PLATFORM_ID)).toBe(false);
    expect(gateway.policies().get(DEMO_DRIVE_PLATFORM_ID)).toBe(drive);
  });
});
