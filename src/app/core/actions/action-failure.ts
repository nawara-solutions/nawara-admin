import { ADAPTER_UNAVAILABLE, AppError } from '../errors/app-error';

/**
 * Why an administrative action did not complete (docs/ARCHITECTURE.md §12), from the person's side: what happened to
 * the data, and what they can do. Mapped from `AppError` kind and documented Core codes only; Core's human `message` is
 * never read.
 */
export type ActionFailure =
  | { readonly kind: 'validation'; readonly messages: readonly string[] }
  | { readonly kind: 'conflict'; readonly code?: string }
  /** `403`/`404` (or the session ended) during the action: the person may not do it (any more). */
  | { readonly kind: 'refused' }
  /** The step-up was refused, missing or expired (`step_up_required`, or a wrong code): verify again. */
  | { readonly kind: 'verificationRefused' }
  | { readonly kind: 'rateLimited'; readonly retryAfterSeconds?: number }
  /** The command was sent and no answer came back: it may or may not have been applied. */
  | { readonly kind: 'outcomeUnknown' }
  /** The service refused before applying anything (`503`), or was not reached before sending. */
  | { readonly kind: 'unavailable' }
  /** No adapter in this build: nothing can ever be sent. */
  | { readonly kind: 'notInBuild' }
  /** The actor or scope changed after the action was opened: it was not sent. */
  | { readonly kind: 'stale' };

/** What the person can do next: send the same request again (same key), verify again, edit the input, or nothing. */
export type ActionRetry = 'resend' | 'verify' | 'edit' | 'none';

/** Where the error came from: obtaining the step-up (nothing sent yet) or executing the command. */
export type ActionStage = 'verify' | 'execute';

export function actionFailureOf(error: AppError, stage: ActionStage): ActionFailure {
  switch (error.kind) {
    case 'validation':
      return { kind: 'validation', messages: error.messages };
    case 'conflict':
      return error.code === undefined
        ? { kind: 'conflict' }
        : { kind: 'conflict', code: error.code };
    case 'forbidden':
      return error.code === 'step_up_required'
        ? { kind: 'verificationRefused' }
        : { kind: 'refused' };
    case 'unauthenticated':
      // A refused verification answers 401; during the command it means the session ended.
      return stage === 'verify' ? { kind: 'verificationRefused' } : { kind: 'refused' };
    case 'not_found':
      return { kind: 'refused' };
    case 'rate_limited':
      return error.retryAfterSeconds === undefined
        ? { kind: 'rateLimited' }
        : { kind: 'rateLimited', retryAfterSeconds: error.retryAfterSeconds };
    case 'unavailable':
      return error.code === ADAPTER_UNAVAILABLE ? { kind: 'notInBuild' } : { kind: 'unavailable' };
    case 'network':
    case 'unexpected':
      return stage === 'execute' ? { kind: 'outcomeUnknown' } : { kind: 'unavailable' };
  }
}

export function retryOf(failure: ActionFailure): ActionRetry {
  switch (failure.kind) {
    case 'outcomeUnknown':
    case 'unavailable':
    case 'rateLimited':
      return 'resend';
    case 'verificationRefused':
      return 'verify';
    case 'validation':
      return 'edit';
    default:
      return 'none';
  }
}

/** Generic copy of each failure (catalog keys); a documented Core code may have its own (`CODE_KEYS`). */
const KIND_KEYS = {
  validation: 'actions.failure.validation',
  conflict: 'actions.failure.conflict',
  refused: 'actions.failure.refused',
  verificationRefused: 'actions.failure.verificationRefused',
  rateLimited: 'actions.failure.rateLimited',
  outcomeUnknown: 'actions.failure.outcomeUnknown',
  unavailable: 'actions.failure.unavailable',
  notInBuild: 'actions.failure.notInBuild',
  stale: 'actions.failure.stale',
} as const satisfies Record<ActionFailure['kind'], string>;

const CODE_KEYS: Readonly<Record<string, string>> = {
  not_authoritative: 'actions.failure.notAuthoritative',
  idempotency_key_reused: 'actions.failure.keyReused',
};

export function failureKey(failure: ActionFailure): string {
  if (failure.kind === 'conflict' && failure.code !== undefined && CODE_KEYS[failure.code])
    return CODE_KEYS[failure.code] ?? 'actions.failure.conflict';
  if (failure.kind === 'rateLimited' && failure.retryAfterSeconds !== undefined)
    return 'actions.failure.rateLimitedFor';
  return KIND_KEYS[failure.kind];
}
