import { Injectable, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { OrganizationId, PlatformRef } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { AdminInvitationGateway } from '../data-access/admin-invitation.gateway';
import {
  AdminInvitation,
  CreateAttempt,
  possibleFromAttempt,
} from '../domain/admin-invitation.model';
import { keyedLoad } from './keyed-load';
import { OrganizationDetailFacade } from './organization-detail.facade';

/** What the invitations card shows. `hidden`: not the owner (nothing is requested, nothing rendered). */
export type AdminInvitationsView =
  | { readonly status: 'hidden' }
  | { readonly status: 'loading' }
  | { readonly status: 'notInBuild' }
  | { readonly status: 'error' }
  | {
      readonly status: 'ready';
      readonly organizationId: OrganizationId;
      readonly platform: PlatformRef;
      readonly invitations: readonly AdminInvitation[];
    };

/**
 * View state of one Organization's admin invitations (P3b-S3), scoped to the detail route. Owner only (UX; Core
 * authorizes): for anyone else the Organization id is `null`, so the gateway is never called. The list follows the
 * detail page's Organization (already checked against the Platform in the URL) and `ScopeContext.revision`.
 *
 * It holds metadata only. Invitation codes never pass through here: a code lives in the create answer and its dialog.
 */
@Injectable()
export class AdminInvitationsFacade {
  private readonly session = inject(AuthSession);
  private readonly detail = inject(OrganizationDetailFacade);
  private readonly gateway = inject(AdminInvitationGateway);
  private readonly reloads = new Subject<void>();

  /** Owner only: `platform.access.view` (Core refuses operators with a collapsed 404). */
  readonly shown = computed(() => can(this.session.actor(), 'platform.access.view'));
  readonly available = this.gateway.available;
  /** The session's own user id: Core's `createdBy` is compared with it ("You"). */
  readonly userId = computed(() => this.session.actor()?.userId ?? null);

  private readonly target = computed(() => {
    const view = this.detail.view();
    return this.shown() && view.status === 'ready'
      ? { organizationId: view.detail.id, platform: view.platform }
      : null;
  });
  private readonly organizationId = computed(() => this.target()?.organizationId ?? null);
  private readonly raw = keyedLoad(this.organizationId, this.reloads, (id) =>
    this.gateway.list(id),
  );

  readonly view = computed<AdminInvitationsView>(() => {
    const target = this.target();
    if (target === null) return { status: 'hidden' };
    const state = this.raw();
    switch (state.status) {
      case 'success':
        // An answer about another Organization (a switch in flight) reads as loading.
        return state.data.organizationId === target.organizationId
          ? { status: 'ready', ...target, invitations: state.data.invitations }
          : { status: 'loading' };
      case 'error':
        return state.error.kind === 'unavailable' && state.error.code === ADAPTER_UNAVAILABLE
          ? { status: 'notInBuild' }
          : { status: 'error' };
      case 'forbidden':
        return { status: 'error' };
      default:
        return { status: 'loading' };
    }
  });

  /** After a create whose answer was lost: what was known before it, to point at what MAY be its invitation. */
  private readonly attempt = signal<CreateAttempt | null>(null);
  readonly possibleFromAttempt = computed<ReadonlySet<string>>(() => {
    const view = this.view();
    const attempt = this.attempt();
    return attempt !== null && view.status === 'ready'
      ? possibleFromAttempt(attempt, view.invitations)
      : new Set();
  });

  /** Asks the card to move focus to its heading (after a revocation removed the focused control). */
  readonly focusRequests = signal(0);

  /** The ids listed now (before an attempt is sent). */
  knownIds(): ReadonlySet<string> {
    const view = this.view();
    return new Set(view.status === 'ready' ? view.invitations.map((i) => i.id) : []);
  }

  markUncertain(attempt: CreateAttempt): void {
    this.attempt.set(attempt);
  }

  requestFocus(): void {
    this.focusRequests.update((n) => n + 1);
  }

  reload(): void {
    this.reloads.next();
  }
}
