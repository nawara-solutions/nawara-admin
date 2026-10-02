/**
 * The one error model of the application (docs/ARCHITECTURE.md §9). Behaviour branches on `kind` and `code` only;
 * `serverMessage` is Core's localized `message`, for display fallback, never for logic. The HTTP error interceptor that
 * maps `HttpErrorResponse` into this type arrives with the first HTTP adapter.
 */
export type AppError = AppErrorBody & AppErrorContext;

type AppErrorBody =
  | { readonly kind: 'network' }
  | { readonly kind: 'unauthenticated'; readonly code?: string }
  | { readonly kind: 'forbidden'; readonly code?: string }
  | { readonly kind: 'not_found'; readonly code?: string }
  | { readonly kind: 'conflict'; readonly code?: string }
  | { readonly kind: 'validation'; readonly messages: readonly string[] }
  | { readonly kind: 'rate_limited'; readonly retryAfterSeconds?: number }
  | { readonly kind: 'unavailable'; readonly code?: string }
  | { readonly kind: 'unexpected' };

interface AppErrorContext {
  /** HTTP status; 0 when no request was made (for example, no adapter is available in this build). */
  readonly status: number;
  readonly requestId?: string;
  readonly serverMessage?: string;
}

export type AppErrorKind = AppErrorBody['kind'];

const KINDS: ReadonlySet<string> = new Set<AppErrorKind>([
  'network',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'validation',
  'rate_limited',
  'unavailable',
  'unexpected',
]);

export const isAppError = (value: unknown): value is AppError =>
  typeof value === 'object' &&
  value !== null &&
  'kind' in value &&
  typeof value.kind === 'string' &&
  KINDS.has(value.kind) &&
  'status' in value &&
  typeof value.status === 'number';

/** Anything that is not already an `AppError` (a thrown bug, a malformed value) is `unexpected`, never success. */
export const toAppError = (value: unknown): AppError =>
  isAppError(value) ? value : { kind: 'unexpected', status: 0 };

/** The domain has no adapter in this build: no Core contract exists yet and demo data is not enabled. */
export const ADAPTER_UNAVAILABLE = 'adapter_unavailable';

export const adapterUnavailable = (): AppError => ({
  kind: 'unavailable',
  code: ADAPTER_UNAVAILABLE,
  status: 0,
});
