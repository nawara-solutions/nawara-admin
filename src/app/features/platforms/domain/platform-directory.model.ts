import { PlatformRef } from '../../../core/context/scope.model';

/**
 * The Company's Platform directory (`/platforms`, company scope; docs/ARCHITECTURE.md §6, §7).
 *
 * Provisional frontend model. Core V1 has no human route that lists a Company's Platforms or counts what they hold
 * (docs/CORE-INTEGRATION.md §7, follow-ups CF-02, CF-03, CF-11); the only adapter is a mock with fictional data.
 */

/** A count that may be unknown. An unavailable value is shown as unavailable and never becomes zero. */
export type DirectoryMetric =
  { readonly status: 'available'; readonly value: number } | { readonly status: 'unavailable' };

export interface PlatformDirectoryEntry {
  readonly platform: PlatformRef;
  readonly organizations: DirectoryMetric;
  /** Memberships in this Platform's Organizations; may overlap with other Platforms', never summed into identities. */
  readonly memberships: DirectoryMetric;
  /** Active operator ASSIGNMENTS to this Platform (not unique operators). */
  readonly operatorAssignments: DirectoryMetric;
}
