import { ADAPTER_UNAVAILABLE, toAppError } from '../../../core/errors/app-error';
import { AssistanceContextRefusal } from '../domain/assistance-read-context';

/**
 * How an assistance read failed, for the views (Assistance A2). Decided from `AppError.kind` and `code` only, never from Core's
 * human message. Reads are safe to repeat; nothing here retries on its own.
 * - `notInBuild`: no adapter in this build (every build until A3; production always);
 * - `noContext`: refused locally, before any request (`assistanceReadContext`);
 * - `signedOut` (`401`), `forbidden` (`403`: not the owner);
 * - `notFound` (`404`): unknown, OR another Company's or Platform's: Core gives one answer, so Admin shows one;
 * - `invalidRequest` (`400`): a filter or cursor Core refuses;
 * - `unavailable` (`503`), `network`, `rateLimited`, `unexpected`.
 */
export type AssistanceReadFailure =
  | { readonly kind: 'notInBuild' }
  | { readonly kind: 'noContext'; readonly refusal: AssistanceContextRefusal }
  | { readonly kind: 'signedOut' }
  | { readonly kind: 'forbidden' }
  | { readonly kind: 'notFound' }
  | { readonly kind: 'invalidRequest' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'rateLimited' }
  | { readonly kind: 'network' }
  | { readonly kind: 'unexpected' };

export function assistanceReadFailureOf(error: unknown): AssistanceReadFailure {
  const e = toAppError(error);
  switch (e.kind) {
    case 'unavailable':
      return e.code === ADAPTER_UNAVAILABLE ? { kind: 'notInBuild' } : { kind: 'unavailable' };
    case 'unauthenticated':
      return { kind: 'signedOut' };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'not_found':
      return { kind: 'notFound' };
    case 'validation':
      return { kind: 'invalidRequest' };
    case 'rate_limited':
      return { kind: 'rateLimited' };
    case 'network':
      return { kind: 'network' };
    // A read never conflicts; a `409` here is not a contract Admin knows.
    case 'conflict':
    case 'unexpected':
      return { kind: 'unexpected' };
  }
}

/** A local refusal as a failure (no request was made). */
export const noContext = (refusal: AssistanceContextRefusal): AssistanceReadFailure => ({
  kind: 'noContext',
  refusal,
});
