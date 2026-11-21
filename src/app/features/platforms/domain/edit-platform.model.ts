import { CompanyId, PlatformId } from '../../../core/context/scope.model';

/**
 * Editing a Platform (M4; Core `PATCH /organization/admin/platforms/:id`, verified at nawara-core `b1baacc`,
 * organization-service `admin/admin.controller.ts` `updatePlatform`): the Company owner only, the name only (1–200 after
 * trimming), no step-up, no idempotency key and no version. The key, the product and the Company never change here.
 * Everything here is pure.
 */

/** Exactly Core's body: the name, trimmed. Never an immutable field. */
export interface PlatformPatch {
  readonly name: string;
}

/**
 * Core's answer (`200`, `PlatformDto`), the fields Admin reads. Core also returns `createdAt` and `updatedAt`; the demo
 * world keeps neither, so none is shown or invented.
 */
export interface UpdatedPlatform {
  readonly id: PlatformId;
  readonly companyId: CompanyId;
  readonly name: string;
  readonly key: string | null;
}

/** The patch for a typed name, or `null` when saving would change nothing (the trimmed name is the current one). */
export function platformPatchFrom(original: string, typed: string): PlatformPatch | null {
  const name = typed.trim();
  return name === original ? null : { name };
}
