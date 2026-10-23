import { Signal, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, of, startWith, switchMap } from 'rxjs';
import { ScopeContext } from '../../../core/context/scope-context';
import { ViewState, toViewState } from '../../../core/state/view-state';

const IDLE = { status: 'idle' } as const;

/**
 * One load per key (a Platform or Organization id): a new key, a reload or a hierarchy change
 * (`ScopeContext.revision`, e.g. an Organization created) cancels the request in flight (`switchMap`) and loads again;
 * a `null` key requests nothing (`idle`). Call in an injection context (a facade's field).
 */
export function keyedLoad<K extends string, T>(
  key: Signal<K | null>,
  reloads: Observable<void>,
  request: (key: K) => Observable<T>,
): Signal<ViewState<T>> {
  return toSignal(
    combineLatest([
      toObservable(key),
      toObservable(inject(ScopeContext).revision),
      reloads.pipe(startWith(undefined)),
    ]).pipe(switchMap(([k]) => (k === null ? of<ViewState<T>>(IDLE) : toViewState(request(k))))),
    { initialValue: IDLE as ViewState<T> },
  );
}
