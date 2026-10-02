/**
 * Administrative scope (docs/ARCHITECTURE.md §7): Company → Platforms → Organizations → users and memberships.
 *
 * - **Company scope** ("All platforms"): company-wide administration. Owner only.
 * - **Platform scope**: administration of one Platform, entered by URL (`/platforms/:platformId`).
 *
 * Selecting a scope is context selection, never authentication: Core authorizes each request from the same bearer.
 */

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Opaque Core ids, branded so that ids of different domains cannot be mixed up (§4). */
export type CompanyId = Brand<string, 'CompanyId'>;
export type PlatformId = Brand<string, 'PlatformId'>;

export const companyId = (value: string): CompanyId => value as CompanyId;
export const platformId = (value: string): PlatformId => value as PlatformId;

export type AdminScope =
  { readonly kind: 'company' } | { readonly kind: 'platform'; readonly platformId: PlatformId };

/**
 * Product family of a Platform, used only to pick an icon. Frontend view field: Core's Platform has `id`, `companyId`,
 * `name` and an optional `key` slug, and no product type (organization-service `PlatformDto`).
 */
export type PlatformProduct = 'school' | 'drive';

export interface PlatformRef {
  readonly id: PlatformId;
  readonly name: string;
  /** Core's optional public slug (`^[a-z][a-z0-9-]{1,39}$`): a machine value, never translated. */
  readonly key: string | null;
  readonly product: PlatformProduct | null;
}

/** The Company and its Platforms, as the context switcher needs them. No Core human route provides this yet (CF-02). */
export interface CompanyDirectory {
  readonly company: { readonly id: CompanyId; readonly name: string };
  readonly platforms: readonly PlatformRef[];
}
