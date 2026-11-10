import { Signal, signal } from '@angular/core';
import { PlatformId } from '../../../core/context/scope.model';

/** Platform policy access; production has no configured command adapter. */
export abstract class PlatformSettingsGateway {
  abstract readonly available: boolean;
  abstract readonly policies: Signal<ReadonlyMap<PlatformId, boolean>>;
  abstract setAssistedPayments(platform: PlatformId, enabled: boolean): boolean;
}

export class UnavailablePlatformSettingsGateway extends PlatformSettingsGateway {
  readonly available = false;
  readonly policies = signal<ReadonlyMap<PlatformId, boolean>>(new Map()).asReadonly();
  setAssistedPayments(): boolean {
    return false;
  }
}
