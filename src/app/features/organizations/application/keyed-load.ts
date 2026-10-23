import { Signal, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Observable, combineLatest, of, skip, startWith, switchMap } from 'rxjs';
import { ScopeContext } from '../../../core/context/scope-context';
import { ViewState, toViewState } from '../../../core/state/view-state';

const IDLE = { status: 'idle' } as const;

/**
 * One load per key (a Platform or Organization id): a new key, a reload or a hierarchy change
 * (`ScopeContext.revision`, e.g. an Organization created or edited) cancels the request in flight (`switchMap`) and
 * loads again; a `null` key requests nothing (`idle`). Call in an injection context (a facade's field).
 *
 * A hierarchy change for the same key refreshes in place: the current state stays shown until the new answer (no
 * `loading` in between), so the page does not flash and focus stays where it was (e.g. back on "Edit details").
 */
export function keyedLoad<K extends string, T>(
  key: Signal<K | null>,
  reloads: Observable<void>,
  request: (key: K) => Observable<T>,
): Signal<ViewState<T>> {
  let lastKey: K | null = null;
  let lastRevision: number | null = null;
  return toSignal(
    combineLatest([
      toObservable(key),
      toObservable(inject(ScopeContext).revision),
      reloads.pipe(startWith(undefined)),
    ]).pipe(
      switchMap(([k, revision]) => {
        const refresh = k !== null && k === lastKey && revision !== lastRevision;
        lastKey = k;
        lastRevision = revision;
        if (k === null) return of<ViewState<T>>(IDLE);
        const states = toViewState(request(k));
        return refresh ? states.pipe(skip(1)) : states;
      }),
    ),
    { initialValue: IDLE as ViewState<T> },
  );
}
