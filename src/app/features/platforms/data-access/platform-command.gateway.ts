import { Observable, throwError } from 'rxjs';
import { CommandOptions } from '../../../core/actions/command-options';
import { adapterUnavailable } from '../../../core/errors/app-error';
import { PlatformId } from '../../../core/context/scope.model';
import { CreatePlatformRequest, CreatedPlatform } from '../domain/create-platform.model';
import { PlatformPatch, UpdatedPlatform } from '../domain/edit-platform.model';

/**
 * Frontend contract for Platform commands (owner only). Core documents `POST /organization/admin/platforms` with the
 * owner's bearer, `x-step-up-token` for `platform.create` and a required `Idempotency-Key` (docs/CORE-INTEGRATION.md
 * §5), but the response shape is not verified and writes are not authoritative before the cutover, so there is no HTTP
 * adapter in this slice: production builds bind the unavailable adapter.
 *
 * The edit (M4) is `PATCH /organization/admin/platforms/:id` (verified at nawara-core `b1baacc`): the owner's bearer, the
 * name only, no step-up, no idempotency key, no version; `409 not_authoritative` before the cutover.
 */
export abstract class PlatformCommandGateway {
  /** Whether this build can send the command at all (the UI shows the action disabled otherwise). */
  abstract readonly available: boolean;
  abstract create(
    request: CreatePlatformRequest,
    options: CommandOptions,
  ): Observable<CreatedPlatform>;
  /** Only `{ name }`, trimmed (`platformPatchFrom`). */
  abstract update(platform: PlatformId, patch: PlatformPatch): Observable<UpdatedPlatform>;
}

/** Every non-demo build: no Core command is wired, so nothing is ever sent. */
export class UnavailablePlatformCommandGateway extends PlatformCommandGateway {
  readonly available = false;

  create(): Observable<CreatedPlatform> {
    return throwError(adapterUnavailable);
  }

  update(): Observable<UpdatedPlatform> {
    return throwError(adapterUnavailable);
  }
}
