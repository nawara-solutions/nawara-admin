import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { NW_CLOCK } from '../../shared/format/clock';
import { AppError } from '../../core/errors/app-error';
import { DemoWorldTables } from './records';
import { demoWorldSeed } from './seed';

/** The seed the world starts from: the canonical one, or a variant a spec provides (always a function of the clock). */
export const DEMO_WORLD_SEED = new InjectionToken<(now: number) => DemoWorldTables>(
  'DEMO_WORLD_SEED',
  {
    factory: () => demoWorldSeed,
  },
);

/**
 * The demo world (development builds only): ONE root instance holding the simulated Core's persistent business and
 * administrative records, read by every demo mock, so all of them agree and a later simulated change shows everywhere.
 *
 * - Seeded once, deterministically, from the injected clock (`NW_CLOCK`) and `DEMO_WORLD_SEED`.
 * - Lives until a reload; a sign-out does not touch it (Core keeps its records). Each TestBed gets a fresh one.
 * - Separate from `DemoAuthState` (the active session and sign-in workflow), which refers to it by identity only.
 * - Imported only by demo mocks (`*.mock.ts`), themselves loaded only through the demo bindings, so a production build
 *   never contains it (the ESLint boundary and `check:production` enforce it).
 *
 * Changes go through ONE boundary, `commit`: a domain-owned command (demo/world/commands/) is a pure function of the
 * current tables that returns either the next tables and its result, or a refusal; the world is replaced atomically, or
 * not at all. Nothing else writes it, so every selector stays consistent and every mock sees the change at once.
 */

/** What a domain command answers: the next world and its result, or a refusal (an `AppError`, Core's documented shape). */
export type CommandOutcome<R> =
  | { readonly ok: true; readonly world: DemoWorldTables; readonly result: R }
  | { readonly ok: false; readonly error: AppError };
@Injectable({ providedIn: 'root' })
export class DemoWorld {
  private readonly state = signal<DemoWorldTables>(inject(DEMO_WORLD_SEED)(inject(NW_CLOCK)()));

  /** The whole world, for the pure selectors (selectors.ts). */
  readonly snapshot = this.state.asReadonly();

  /** Applies a command to the current world: replaces it on success, leaves it untouched on refusal. */
  commit<R>(command: (world: DemoWorldTables) => CommandOutcome<R>): CommandOutcome<R> {
    const outcome = command(this.state());
    if (outcome.ok) this.state.set(outcome.world);
    return outcome;
  }
}
