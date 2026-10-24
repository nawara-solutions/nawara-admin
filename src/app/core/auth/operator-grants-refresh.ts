import { DOCUMENT, DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PlatformId } from '../context/scope.model';
import { toAppError } from '../errors/app-error';
import { AuthGateway } from './auth.gateway';
import { AuthSession } from './auth-session';
import { SIGN_IN_PATH, SIGN_IN_REASON_PARAM, SignInReason } from './return-url';

/** What asked for a refresh (P6-S2b's approved triggers). */
export type GrantsRefreshTrigger = 'refusal' | 'visibility' | 'switch' | 'retry';

/**
 * What an operator is told on a page that refused their Platform (never elsewhere):
 * - `refreshed`: a refresh asked for by that refusal (or a retry) answered; the list now shows what Core grants.
 * - `unavailable`: the refresh failed (network, `429`, `503`): the list and the refusal stay as they were; retry.
 * The Platform is the one whose page asked, so the notice shows there only.
 */
export type GrantsRefreshNotice =
  | { readonly kind: 'refreshed'; readonly platformId: PlatformId | null }
  | { readonly kind: 'unavailable'; readonly platformId: PlatformId | null };

/**
 * Keeps a signed-in OPERATOR's displayed Platform list in step with Core's live `GET /auth/grants` (P6-S2b). One service
 * for every trigger (a refused Platform request, a return to the tab, a Platform switch, "Try again"); shell-scoped,
 * with the shell's `AuthGateway`. It changes what Admin SHOWS only: Core authorizes every request, and a refusal stays a
 * refusal (nothing is resent or re-navigated). Never polls; does nothing for an owner.
 *
 * - **One request at a time.** A trigger during a request is absorbed; a refusal or a retry during one queues exactly
 *   one follow-up (the answer in flight may predate the change that caused it). Overlapping triggers never multiply
 *   requests or notices.
 * - **Stale answers are dropped:** an answer for an earlier request, another user, or a session that has since ended or
 *   been replaced (`AuthSession.epoch`) changes nothing. Requests are numbered; only an answer newer than the last one
 *   applied is applied.
 * - **Identical grants change nothing** (`AuthSession.refreshGrants` compares sets).
 * - **A genuine `401`** (Core ended the session, e.g. the operator was blocked): the local session ends and the sign-in
 *   page opens with "Your session has ended". A transient failure (network, `429`, `503`, unexpected) keeps the
 *   session and the last known list, never an empty one, and offers a retry where a refusal asked.
 */
@Injectable()
export class OperatorGrantsRefresh {
  private readonly gateway = inject(AuthGateway);
  private readonly session = inject(AuthSession);
  private readonly router = inject(Router);

  private sequence = 0;
  private applied = 0;
  private inFlight = false;
  private queued: { trigger: GrantsRefreshTrigger; platformId: PlatformId | null } | null = null;

  private readonly notices = signal<GrantsRefreshNotice | null>(null);
  /** The notice for the page that refused (see `GrantsRefreshNotice`). */
  readonly notice = this.notices.asReadonly();

  private readonly running = signal(false);
  /** A refresh is under way (a retry button waits). */
  readonly busy = this.running.asReadonly();

  constructor() {
    const document = inject(DOCUMENT);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') this.refresh('visibility');
    };
    document.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener('visibilitychange', onVisibility),
    );
  }

  /**
   * Re-reads the signed-in operator's grants. `platformId`: the Platform whose page asked (a refusal or its retry), so
   * the outcome is told there.
   */
  refresh(trigger: GrantsRefreshTrigger, platformId: PlatformId | null = null): void {
    const actor = this.session.actor();
    if (actor?.kind !== 'operator') return;
    const tells = trigger === 'refusal' || trigger === 'retry';
    if (this.inFlight) {
      // Only a refusal or a retry needs an answer newer than the one in flight.
      if (tells) this.queued = { trigger, platformId };
      return;
    }
    if (tells) this.notices.set(null);
    this.send(trigger, platformId, actor.userId);
  }

  /** Forgets the notice (the page that showed it is gone). */
  clearNotice(): void {
    this.notices.set(null);
  }

  private send(trigger: GrantsRefreshTrigger, platformId: PlatformId | null, userId: string): void {
    const request = ++this.sequence;
    const epoch = this.session.epoch();
    const tells = trigger === 'refusal' || trigger === 'retry';
    this.inFlight = true;
    this.running.set(true);
    // A slow or failed send must never block the next one for good.
    const done = () => {
      this.inFlight = false;
      this.running.set(false);
      const next = this.queued;
      this.queued = null;
      const actor = this.session.actor();
      if (next !== null && actor?.kind === 'operator')
        this.send(next.trigger, next.platformId, actor.userId);
    };
    this.gateway.grants().subscribe({
      next: (grants) => {
        if (this.current(request, epoch, userId)) {
          this.applied = request;
          this.session.refreshGrants(epoch, userId, grants.platformAssignments);
          if (tells) this.notices.set({ kind: 'refreshed', platformId });
        }
        done();
      },
      error: (thrown: unknown) => {
        const fresh = this.current(request, epoch, userId);
        if (fresh && toAppError(thrown).kind === 'unauthenticated') {
          this.queued = null;
          this.inFlight = false;
          this.running.set(false);
          this.notices.set(null);
          this.endSession();
          return;
        }
        if (fresh && tells) this.notices.set({ kind: 'unavailable', platformId });
        done();
      },
    });
  }

  /** Whether an answer still belongs to the newest request of the same signed-in operator's same session. */
  private current(request: number, epoch: number, userId: string): boolean {
    const actor = this.session.actor();
    return (
      request > this.applied &&
      epoch === this.session.epoch() &&
      actor?.kind === 'operator' &&
      actor.userId === userId
    );
  }

  /** Core ended the session: end it here too and open the sign-in page with a neutral reason. */
  private endSession(): void {
    this.session.signOut();
    const reason: SignInReason = 'session-expired';
    void this.router.navigate([SIGN_IN_PATH], { queryParams: { [SIGN_IN_REASON_PARAM]: reason } });
  }
}
