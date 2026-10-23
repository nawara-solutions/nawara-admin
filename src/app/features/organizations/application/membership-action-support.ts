import { Injectable, Signal, computed, signal } from '@angular/core';
import { Observable, defer, throwError } from 'rxjs';
import { ActionContext, ActionPhase } from '../../../core/actions/action-run';
import { Actor } from '../../../core/auth/actor';
import { ScopeContext } from '../../../core/context/scope-context';
import { OrganizationId, PlatformId } from '../../../core/context/scope.model';
import { AppError } from '../../../core/errors/app-error';

/** The Organization a membership action is for, as the members pages show it (checked against the URL's Platform). */
export interface MembershipActionTarget {
  readonly organizationId: OrganizationId;
  readonly organizationName: string;
  readonly platformId: PlatformId;
}

/**
 * One membership action at a time on the members pages (P5-S2 decisions, P5-S3a revocation): each action registers
 * its run, and every membership control waits while any of them is sent. Route-scoped with the members facade.
 */
@Injectable()
export class MembershipActionLock {
  private readonly runs = signal<readonly Signal<ActionPhase<unknown>>[]>([]);

  register(state: Signal<ActionPhase<unknown>>): void {
    this.runs.update((runs) => [...runs, state]);
  }

  /** Whether a membership action of the page is being sent. */
  readonly busy = computed(() => this.runs().some((state) => state().phase === 'pending'));
}

/** Who acts, for an `ActionRun`: the owner in their Company, an operator in their assignments (Core decides). */
export function membershipActionContext(actor: Actor | null): ActionContext | null {
  if (actor === null) return null;
  return {
    actorId: actor.userId,
    scope: actor.kind === 'owner' ? actor.companyId : 'assigned-platforms',
  };
}

/** Immediately before sending: the Organization's Platform is still one of the actor's; otherwise nothing is sent. */
export function guardedByPlatform<T>(
  scope: ScopeContext,
  platform: PlatformId,
  send: () => Observable<T>,
): Observable<T> {
  return defer(() => {
    const platforms = scope.platforms();
    return platforms.status === 'success' && platforms.data.some((p) => p.id === platform)
      ? send()
      : throwError((): AppError => ({ kind: 'not_found', status: 404 }));
  });
}
