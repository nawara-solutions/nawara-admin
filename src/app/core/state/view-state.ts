import { Observable, catchError, map, of, startWith } from 'rxjs';
import { AppError, toAppError } from '../errors/app-error';

/** The standard state of a data-driven view (docs/ARCHITECTURE.md §20). Every page handles every applicable state. */
export type ViewState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'empty' }
  | { readonly status: 'forbidden' }
  | { readonly status: 'error'; readonly error: AppError };

/**
 * Turns one load into a stream of view states: `loading`, then `success` / `empty`, or `forbidden` / `error`.
 * A `forbidden` AppError (Core `403`) becomes the `forbidden` state; anything thrown that is not an AppError is
 * `unexpected`, never success.
 */
export function toViewState<T>(
  source: Observable<T>,
  isEmpty: (data: T) => boolean = () => false,
): Observable<ViewState<T>> {
  return source.pipe(
    map((data): ViewState<T> =>
      isEmpty(data) ? { status: 'empty' } : { status: 'success', data },
    ),
    catchError((thrown: unknown) => {
      const error = toAppError(thrown);
      return of<ViewState<T>>(
        error.kind === 'forbidden' ? { status: 'forbidden' } : { status: 'error', error },
      );
    }),
    startWith<ViewState<T>>({ status: 'loading' }),
  );
}
