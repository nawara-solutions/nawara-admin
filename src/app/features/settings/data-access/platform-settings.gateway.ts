import { Signal, signal } from '@angular/core';
import { PlatformId } from '../../../core/context/scope.model';

/**
 * The Platforms' assisted-payments policy, read only. There is no write: Core offers no such mutable policy and derives
 * assistance eligibility from Billing, catalog, fee, restriction and member conditions (A31-04 / X34, WP-1.1).
 */
export abstract class PlatformSettingsGateway {
  abstract readonly available: boolean;
  abstract readonly policies: Signal<ReadonlyMap<PlatformId, boolean>>;
}

export class UnavailablePlatformSettingsGateway extends PlatformSettingsGateway {
  readonly available = false;
  readonly policies = signal<ReadonlyMap<PlatformId, boolean>>(new Map()).asReadonly();
}
