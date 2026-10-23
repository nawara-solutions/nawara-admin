import { Injectable, computed, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { can } from '../../../core/access/capability-policy';
import { AuthSession } from '../../../core/auth/auth-session';
import { PlatformAccess, platformAccessOf } from '../../../core/context/platform-access';
import { ScopeContext, organizationOfPage } from '../../../core/context/scope-context';
import { OrganizationId, PlatformRef } from '../../../core/context/scope.model';
import { ADAPTER_UNAVAILABLE } from '../../../core/errors/app-error';
import { ViewState } from '../../../core/state/view-state';
import { OrganizationCommercialGateway } from '../data-access/organization-commercial.gateway';
import { OrganizationGateway } from '../data-access/organization.gateway';
import { OrganizationCommercial } from '../domain/organization-commercial.model';
import { OrganizationDetail } from '../domain/organization.model';
import { keyedLoad } from './keyed-load';

/**
 * What the detail page shows. `notFound` is the Organization-level "not found or not accessible" (unknown, not yours,
 * or of another Platform than the one in the URL: one state, as Core collapses them); it still names the Platform so
 * the page can lead back to its directory. `notAccessible` is the Platform itself.
 */
export type OrganizationDetailView =
  | Exclude<PlatformAccess, { readonly status: 'granted' }>
  | { readonly status: 'loading'; readonly platform: PlatformRef }
  | { readonly status: 'notInBuild'; readonly platform: PlatformRef }
  | { readonly status: 'error'; readonly platform: PlatformRef }
  | { readonly status: 'notFound'; readonly platform: PlatformRef }
  | {
      readonly status: 'ready';
      readonly platform: PlatformRef;
      readonly detail: OrganizationDetail;
    };

/**
 * View state of one Organization (`/platforms/:platformId/organizations/:organizationId`; docs/ARCHITECTURE.md §7),
 * scoped to the route. No Organization context or scope: the ids come from the URL, the Organization is an entity of
 * the Platform in the URL.
 *
 * - The Platform is checked first; nothing about the Organization is requested before it is granted.
 * - The Organization is loaded by its id (as Core's single read is) and shown only if the answer is the Organization
 *   in the URL AND belongs to the Platform in the URL; otherwise `notFound`. A late answer for a previous id reads as
 *   loading; switching cancels the request in flight.
 * - The commercial facts are the owner's only, and are asked for only once the Organization is shown.
 */
@Injectable()
export class OrganizationDetailFacade {
  private readonly context = inject(ScopeContext);
  private readonly session = inject(AuthSession);
  private readonly gateway = inject(OrganizationGateway);
  private readonly commercialGateway = inject(OrganizationCommercialGateway);
  private readonly reloads = new Subject<void>();
  private readonly commercialReloads = new Subject<void>();

  readonly access = computed<PlatformAccess>(() =>
    platformAccessOf(this.context.scope(), this.context.platforms(), this.session.actor()),
  );

  readonly showsCommercial = computed(() => can(this.session.actor(), 'platform.commercial.view'));
  readonly showsActivity = computed(() => can(this.session.actor(), 'platform.activity.view'));
  readonly showsAccess = computed(() => can(this.session.actor(), 'platform.access.view'));

  /**
   * The Organization in the URL (its detail, or its members' pages), once its Platform is granted; `null` requests
   * nothing.
   */
  private readonly organizationId = computed<OrganizationId | null>(() =>
    this.access().status === 'granted' ? organizationOfPage(this.context.platformPage()) : null,
  );

  private readonly raw = keyedLoad(this.organizationId, this.reloads, (id) =>
    this.gateway.load(id),
  );

  readonly view = computed<OrganizationDetailView>(() => {
    const access = this.access();
    if (access.status !== 'granted') return access;
    const { platform } = access;
    const organization = this.organizationId();
    const state = this.raw();
    switch (state.status) {
      case 'success':
        if (state.data.id !== organization) return { status: 'loading', platform };
        return state.data.platformId === platform.id
          ? { status: 'ready', platform, detail: state.data }
          : { status: 'notFound', platform };
      case 'forbidden':
        return { status: 'notFound', platform };
      case 'error':
        if (state.error.kind === 'not_found') return { status: 'notFound', platform };
        return state.error.kind === 'unavailable' && state.error.code === ADAPTER_UNAVAILABLE
          ? { status: 'notInBuild', platform }
          : { status: 'error', platform };
      default:
        return { status: 'loading', platform };
    }
  });

  /** Asked only for the owner, and only for the Organization being shown. */
  private readonly commercialId = computed<OrganizationId | null>(() => {
    const view = this.view();
    return this.showsCommercial() && view.status === 'ready' ? view.detail.id : null;
  });

  private readonly commercialRaw = keyedLoad(this.commercialId, this.commercialReloads, (id) =>
    this.commercialGateway.load(id),
  );

  /** The owner's commercial facts of the Organization shown; `idle` for anyone else. */
  readonly commercial = computed<ViewState<OrganizationCommercial>>(() => {
    const view = this.view();
    const id = this.commercialId();
    const state = this.commercialRaw();
    if (id === null || view.status !== 'ready') return { status: 'idle' };
    if (state.status !== 'success') return state;
    return state.data.organizationId === id && state.data.platformId === view.platform.id
      ? state
      : { status: 'loading' };
  });

  /** "Try again": the Organization, or the scope directory when the Platforms could not be listed. */
  reload(): void {
    if (this.access().status === 'directoryUnavailable') this.context.reload();
    else this.reloads.next();
  }

  reloadCommercial(): void {
    this.commercialReloads.next();
  }
}
