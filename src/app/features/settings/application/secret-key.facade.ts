import {
  DestroyRef,
  Injectable,
  InjectionToken,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { StepUpGateway } from '../../../core/auth/step-up.gateway';
import { ADAPTER_UNAVAILABLE, AppError, toAppError } from '../../../core/errors/app-error';
import { AccountSecurityGateway, SecretKeyIssue } from '../data-access/account-security.gateway';
import { AccountSecurityFacade } from './account-security.facade';

/** Core's key: 13 groups of 4 (P9-S4-0). */
export const SECRET_KEY_GROUPS = 13;
const GROUP_LENGTH = 4;

/**
 * Picks which group (0-based, `0 … SECRET_KEY_GROUPS - 1`) the owner types back from their saved copy. Random by
 * default, so it cannot be anticipated; tests inject a fixed one.
 */
export const SECRET_KEY_CHECK_GROUP = new InjectionToken<() => number>('SECRET_KEY_CHECK_GROUP', {
  factory: () => () => {
    const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
    return value % SECRET_KEY_GROUPS;
  },
});

/**
 * Where creating a new secret key is (P9-S4c; docs/design/p9-s4-account-security.md §11). `shown` and `checked` hold
 * the key; `creating` may be about to. Those three ask before the page is left.
 */
export type SecretKeyState =
  /** Nothing started, or everything dropped (the page left). */
  | { readonly phase: 'idle' }
  /** Reading the factors: the owner confirms it's them with an authenticator code, so one must be confirmed. */
  | { readonly phase: 'checking' }
  /** No confirmed authenticator (a passkey-only owner): nothing can be confirmed, so nothing is offered. */
  | { readonly phase: 'noAuthenticator' }
  /** The factors could not be read: only a manual "Try again". Nothing was sent. */
  | { readonly phase: 'loadFailed' }
  /** What the key is, the irreversible warning and the acknowledgement. Nothing is sent from here. */
  | { readonly phase: 'intro' }
  /** Confirming it's the owner with an authenticator they already use (step-up `owner.secret_key.rotate`). */
  | {
      readonly phase: 'verifying';
      readonly busy: boolean;
      readonly problem: 'proofRefused' | 'expired' | 'unavailable' | null;
    }
  /** The rotation was sent: everything is locked until its answer, which is never resent. */
  | { readonly phase: 'creating' }
  /**
   * The new key, masked until revealed. `checkGroup`: the group (0-based) to type back while the key is hidden;
   * `checkFailed`: the last attempt did not match.
   */
  | {
      readonly phase: 'shown';
      readonly issuedAt: string | null;
      readonly revealed: boolean;
      readonly checkGroup: number;
      readonly checkFailed: boolean;
    }
  /** The group matched: the owner still confirms they saved the key, then Done. */
  | {
      readonly phase: 'checked';
      readonly issuedAt: string | null;
      readonly revealed: boolean;
      readonly checkGroup: number;
    }
  /** Too many attempts (`429`): nothing changed and nothing is retried automatically. */
  | { readonly phase: 'rateLimited' }
  /**
   * The rotation may have committed and no usable key came back: the previous key may no longer work and the new one
   * cannot be shown. `incomplete`: a success status without a usable key (it did commit).
   */
  | { readonly phase: 'unknown'; readonly reason: 'noAnswer' | 'incomplete' }
  | { readonly phase: 'done' }
  /** Left before anything was sent: nothing changed. */
  | { readonly phase: 'cancelled' }
  /** Left with the key unsaved (or while it was being created): everything was dropped. */
  | { readonly phase: 'abandoned' }
  /** Not the owner (any more), or the session changed or ended: everything was dropped. */
  | { readonly phase: 'refused' }
  /** No adapter in this build: nothing can be created. */
  | { readonly phase: 'notInBuild' };

export type SecretKeyPhase = SecretKeyState['phase'];

const BUSY: ReadonlySet<SecretKeyPhase> = new Set<SecretKeyPhase>(['checking', 'creating']);
/** Phases that hold the key, or may be about to: leaving them loses it. */
const HOLDS_KEY: ReadonlySet<SecretKeyPhase> = new Set<SecretKeyPhase>([
  'creating',
  'shown',
  'checked',
]);

/** A TOTP code: six digits, kept as a string (leading zeroes). */
const CODE = /^\d{6}$/;

/** The key Core returned, split for display; `raw` is what is copied (Core's own form). */
interface HeldKey {
  readonly raw: string;
  readonly groups: readonly string[];
}

/** Core's key as 13 groups of 4 letters or digits, whatever its separators (not declared, CF-59); else `null`. */
function parseKey(issue: SecretKeyIssue | null | undefined): HeldKey | null {
  const raw = typeof issue?.secretKey === 'string' ? issue.secretKey.trim() : '';
  const compact = raw.replace(/[^0-9a-z]/gi, '').toUpperCase();
  if (compact.length !== SECRET_KEY_GROUPS * GROUP_LENGTH) return null;
  const groups = Array.from({ length: SECRET_KEY_GROUPS }, (_, i) =>
    compact.slice(i * GROUP_LENGTH, (i + 1) * GROUP_LENGTH),
  );
  return { raw, groups };
}

const instant = (value: unknown): string | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;

/**
 * Creating a new secret key for the signed-in owner's own account (P9-S4c): the first one or a replacement, which
 * Admin cannot tell apart (no existence read, CF-54). One explicit state machine, provided by the page, so it lives
 * exactly as long as the page. Not `ActionRun`: its "Try again" resends after an unknown outcome, and it reports a
 * detached answer with a toast after the page is left; both are wrong for a key returned once.
 *
 * Rules:
 * - Nothing is sent before the owner acknowledges the warning and confirms it's them. Each rotation follows one
 *   explicit "Create new key", with a grant obtained for it and never kept or reused.
 * - One request at a time; input is ignored while busy. A rotation is never resent: `401`, `403` and `429` are
 *   definite refusals (nothing changed); anything else (no answer, a network error, any `5xx`, an unexpected status,
 *   a success without a usable key) is `unknown`, and only a completely new flow can follow.
 * - The key is held in this object's memory only, masked until revealed, copied only on request, and dropped on Done,
 *   on leaving, on a session change (sign-out, another identity, or a new session of the same owner) and when the page
 *   is destroyed. No URL, storage, history state, log, toast or notice. Late answers are ignored.
 */
@Injectable()
export class SecretKeyFacade {
  private readonly gateway = inject(AccountSecurityGateway);
  private readonly stepUp = inject(StepUpGateway);
  private readonly session = inject(AuthSession);
  private readonly security = inject(AccountSecurityFacade);
  private readonly pickGroup = inject(SECRET_KEY_CHECK_GROUP);

  private readonly current = signal<SecretKeyState>({ phase: 'idle' });
  readonly state = this.current.asReadonly();

  private readonly held = signal<HeldKey | null>(null);
  /** The key's groups, only while revealed (the page renders nothing of the key otherwise). */
  readonly revealedGroups = computed(() => {
    const state = this.current();
    const revealed = (state.phase === 'shown' || state.phase === 'checked') && state.revealed;
    return revealed ? (this.held()?.groups ?? null) : null;
  });

  readonly busy = computed(() => {
    const state = this.current();
    return BUSY.has(state.phase) || (state.phase === 'verifying' && state.busy);
  });

  /** The signed-in owner allowed to create a key, or `null` (UX; Core refuses anyone else). */
  private readonly ownerId = computed(() => {
    const actor = this.session.actor();
    return actor?.kind === 'owner' && can(actor, 'account.secret_key.rotate') ? actor.userId : null;
  });

  /** The owner and the session the flow started in: any other session (even the same owner's) ends it. */
  private startedFor: string | null = null;
  private startedIn: number | null = null;
  /** Increments whenever everything is dropped or a new flow starts: answers of an earlier run are ignored. */
  private run = 0;
  private readonly destroyed = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed.set(true);
      this.drop({ phase: 'idle' });
    });
    // A sign-out, another identity or a new session: nothing of this flow may survive into it.
    effect(() => {
      this.ownerId();
      this.session.epoch();
      this.sessionHolds();
    });
  }

  /** Starts the flow (the page was entered): checks the factors. Creates nothing. Once per page. */
  start(): void {
    if (this.current().phase !== 'idle' || this.destroyed()) return;
    const owner = this.ownerId();
    if (owner === null) return this.current.set({ phase: 'refused' });
    this.startedFor = owner;
    this.startedIn = this.session.epoch();
    this.check();
  }

  /** "Try again" after the factors could not be read (manual only). */
  retryCheck(): void {
    if (this.current().phase === 'loadFailed') this.check();
  }

  /**
   * Continue from the warning, only once the owner acknowledged it.
   * @returns `false` when not acknowledged (nothing happens) or not on the warning
   */
  proceed(acknowledged: boolean): boolean {
    if (this.current().phase !== 'intro' || !acknowledged || !this.sessionHolds()) return false;
    this.current.set({ phase: 'verifying', busy: false, problem: null });
    return true;
  }

  /**
   * "Create new key": confirms it's the owner with a code from an authenticator they ALREADY use, then sends the
   * rotation once with that grant.
   * @returns `false` when the code is not six digits (nothing happens) or nothing can be sent now
   */
  verify(proofCode: string): boolean {
    const state = this.current();
    if (state.phase !== 'verifying' || state.busy || !this.sessionHolds()) return false;
    const code = proofCode.replace(/\s/g, '');
    if (!CODE.test(code)) return false;
    const run = this.run;
    this.current.set({ phase: 'verifying', busy: true, problem: null });
    this.stepUp.obtain('owner.secret_key.rotate', { method: 'totp', code }).subscribe({
      next: (grant) => {
        // Left, or another session meanwhile: the grant is dropped unused.
        if (run !== this.run || !this.sessionHolds()) return;
        this.rotate(grant.token, run);
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        const error = toAppError(thrown);
        if (this.ended(error)) return;
        switch (error.kind) {
          case 'unauthenticated':
            return this.current.set({ phase: 'verifying', busy: false, problem: 'proofRefused' });
          case 'rate_limited':
            return this.current.set({ phase: 'rateLimited' });
          default:
            return this.current.set({ phase: 'verifying', busy: false, problem: 'unavailable' });
        }
      },
    });
    return true;
  }

  /** Back from confirming it's you to the warning (nothing was sent). */
  back(): void {
    const state = this.current();
    if (state.phase === 'verifying' && !state.busy) this.current.set({ phase: 'intro' });
  }

  /** After a `429`: back to confirming it's you, by the owner's own choice (no automatic retry). */
  resume(): void {
    if (this.current().phase === 'rateLimited')
      this.current.set({ phase: 'verifying', busy: false, problem: null });
  }

  /** "Create another key" after an unknown outcome: a completely new flow (warning, acknowledgement, verification). */
  startOver(): void {
    if (this.current().phase !== 'unknown' || !this.sessionHolds()) return;
    this.run += 1;
    this.current.set({ phase: 'intro' });
  }

  reveal(): void {
    const state = this.current();
    if ((state.phase === 'shown' || state.phase === 'checked') && !state.revealed)
      this.current.set({ ...state, revealed: true });
  }

  hide(): void {
    const state = this.current();
    if ((state.phase === 'shown' || state.phase === 'checked') && state.revealed)
      this.current.set({ ...state, revealed: false });
  }

  /** Copies the key as Core returned it, on the owner's request only. */
  async copy(): Promise<boolean> {
    const key = this.held();
    const phase = this.current().phase;
    if (key === null || (phase !== 'shown' && phase !== 'checked')) return false;
    try {
      if (!navigator.clipboard?.writeText) return false;
      await navigator.clipboard.writeText(key.raw);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * The local possession check: the chosen group, typed while the key is hidden. Compared here only; never sent.
   * @returns `false` when nothing was compared (the key is revealed, or there is nothing to check)
   */
  checkGroup(value: string): boolean {
    const state = this.current();
    const key = this.held();
    if (state.phase !== 'shown' || state.revealed || key === null) return false;
    const typed = value.replace(/[^0-9a-z]/gi, '').toUpperCase();
    if (typed === key.groups[state.checkGroup])
      this.current.set({
        phase: 'checked',
        issuedAt: state.issuedAt,
        revealed: false,
        checkGroup: state.checkGroup,
      });
    else this.current.set({ ...state, checkFailed: true });
    return true;
  }

  /**
   * Done: only after the group matched AND the owner says the key is saved. Drops the key; Security says so.
   * @returns `false` when not allowed yet
   */
  finish(saved: boolean): boolean {
    if (this.current().phase !== 'checked' || !saved) return false;
    this.drop({ phase: 'done' });
    this.security.announce('keySaved');
    return true;
  }

  /** Cancel before anything was sent (the warning, or confirming it's you while idle). */
  cancel(): boolean {
    const state = this.current();
    const cancellable = state.phase === 'intro' || (state.phase === 'verifying' && !state.busy);
    if (!cancellable) return false;
    this.drop({ phase: 'cancelled' });
    this.security.announce('keyCancelled');
    return true;
  }

  /**
   * Whether leaving now loses a key (shown, or possibly being created). Checks the session first: a flow of an ended
   * or changed session has already been dropped, so nothing is asked.
   */
  leaveLosesKey(): boolean {
    return this.sessionHolds() && HOLDS_KEY.has(this.current().phase);
  }

  /** The owner chose to leave anyway: drops everything; Security says what may have happened. */
  abandon(): void {
    const phase = this.current().phase;
    if (!HOLDS_KEY.has(phase)) return;
    this.drop({ phase: 'abandoned' });
    this.security.announce(phase === 'creating' ? 'keyUnknown' : 'keyNotSaved');
  }

  private check(): void {
    const run = this.run;
    this.current.set({ phase: 'checking' });
    this.gateway.load().subscribe({
      next: ({ factors }) => {
        if (run !== this.run) return;
        if (factors.some((f) => f.type === 'totp' && f.confirmed))
          this.current.set({ phase: 'intro' });
        else this.current.set({ phase: 'noAuthenticator' });
      },
      error: (thrown: unknown) => {
        if (run !== this.run) return;
        if (!this.ended(toAppError(thrown))) this.current.set({ phase: 'loadFailed' });
      },
    });
  }

  /** Sends the rotation ONCE with this grant. The grant is not kept: whatever the answer, a new attempt verifies again. */
  private rotate(token: string, run: number): void {
    this.current.set({ phase: 'creating' });
    let answered = false;
    this.gateway.rotateSecretKey(token).subscribe({
      next: (issue) => {
        answered = true;
        if (run !== this.run) return;
        const key = parseKey(issue);
        // A success status: it committed. Without a usable key, it cannot be shown.
        if (key === null) return this.current.set({ phase: 'unknown', reason: 'incomplete' });
        this.held.set(key);
        this.current.set({
          phase: 'shown',
          issuedAt: instant(issue.issuedAt),
          revealed: false,
          checkGroup: this.pickGroup(),
          checkFailed: false,
        });
      },
      error: (thrown: unknown) => {
        answered = true;
        if (run !== this.run) return;
        const error = toAppError(thrown);
        if (error.kind === 'forbidden' && error.code === 'step_up_required')
          // Definite: refused before anything changed (missing, spent or expired grant).
          return this.current.set({ phase: 'verifying', busy: false, problem: 'expired' });
        if (error.kind === 'rate_limited') return this.current.set({ phase: 'rateLimited' });
        if (this.ended(error)) return;
        // No answer, a network error, any 5xx or anything unexpected: it may have committed. Never resent.
        this.current.set({ phase: 'unknown', reason: 'noAnswer' });
      },
      complete: () => {
        if (!answered && run === this.run)
          this.current.set({ phase: 'unknown', reason: 'incomplete' });
      },
    });
  }

  /**
   * A refusal that ends the flow: no adapter (nothing was sent), not the owner (`403` other than a step-up), or no
   * session (`401` outside the verification). Everything is dropped.
   */
  private ended(error: AppError): boolean {
    if (error.kind === 'unavailable' && error.code === ADAPTER_UNAVAILABLE) {
      this.drop({ phase: 'notInBuild' });
      return true;
    }
    const stepUpRefused = error.kind === 'forbidden' && error.code === 'step_up_required';
    const verifying = this.current().phase === 'verifying';
    const sessionEnded = error.kind === 'unauthenticated' && !verifying;
    if ((error.kind === 'forbidden' && !stepUpRefused) || sessionEnded) {
      this.drop({ phase: 'refused' });
      return true;
    }
    return false;
  }

  /** Whether the flow's owner and session are still the current ones; drops everything when not. */
  private sessionHolds(): boolean {
    if (this.startedFor === null) return true;
    if (this.ownerId() === this.startedFor && this.session.epoch() === this.startedIn) return true;
    this.drop({ phase: 'refused' });
    return false;
  }

  /** Drops the key and ignores every pending answer. */
  private drop(next: SecretKeyState): void {
    this.run += 1;
    this.held.set(null);
    this.startedFor = null;
    this.startedIn = null;
    this.current.set(next);
  }
}
