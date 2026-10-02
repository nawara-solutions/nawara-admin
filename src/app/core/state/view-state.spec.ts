import { firstValueFrom, of, throwError, toArray } from 'rxjs';
import { AppError } from '../errors/app-error';
import { ViewState, toViewState } from './view-state';

const states = <T>(source: Parameters<typeof toViewState<T>>[0], isEmpty?: (d: T) => boolean) =>
  firstValueFrom(toViewState(source, isEmpty).pipe(toArray())) as Promise<ViewState<T>[]>;

describe('toViewState', () => {
  it('emits loading, then success', async () => {
    expect(await states(of(42))).toEqual([{ status: 'loading' }, { status: 'success', data: 42 }]);
  });

  it('emits empty when the data is empty', async () => {
    expect(await states(of([] as number[]), (d) => d.length === 0)).toEqual([
      { status: 'loading' },
      { status: 'empty' },
    ]);
  });

  it('turns a forbidden AppError (Core 403) into the forbidden state', async () => {
    const forbidden: AppError = { kind: 'forbidden', code: 'admin_forbidden', status: 403 };
    expect((await states(throwError(() => forbidden))).at(-1)).toEqual({ status: 'forbidden' });
  });

  it('keeps other AppErrors as errors', async () => {
    const unavailable: AppError = {
      kind: 'unavailable',
      code: 'hierarchy_unavailable',
      status: 503,
    };
    expect((await states(throwError(() => unavailable))).at(-1)).toEqual({
      status: 'error',
      error: unavailable,
    });
  });

  it('never treats an unknown failure as success', async () => {
    expect((await states(throwError(() => new Error('bug')))).at(-1)).toEqual({
      status: 'error',
      error: { kind: 'unexpected', status: 0 },
    });
  });
});
