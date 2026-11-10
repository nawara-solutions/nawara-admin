/**
 * Assisted payments on the Settings page, read only (WP-1.1 removed the write; WP-2.2 the policy). Core has no Platform or
 * Organization assisted-payments policy: it decides each assistance request from its own facts (BIL-13), which Admin does
 * not hold, so the page states only that eligibility is not verified. `available`: whether this build may show the
 * Platform section at all (demo builds); nothing here reads or holds an eligibility value.
 */
export abstract class PlatformSettingsGateway {
  abstract readonly available: boolean;
}

export class UnavailablePlatformSettingsGateway extends PlatformSettingsGateway {
  readonly available = false;
}
