import { CompanyId, PlatformRef } from '../../../core/context/scope.model';

/**
 * Creating a Platform (owner only; Core `POST /organization/admin/platforms`, docs/CORE-INTEGRATION.md §5). The request
 * holds only what Core documents (`companyId`, `name`); the step-up token and the idempotency key travel beside it.
 * PROVISIONAL frontend model: Core's response shape is not verified, and its writes are not authoritative before the
 * organization-service cutover (`409 not_authoritative`).
 */
export interface CreatePlatformRequest {
  readonly companyId: CompanyId;
  readonly name: string;
}

export interface CreatedPlatform {
  readonly platform: PlatformRef;
  /** Core answered a replay of an already applied request (`200`, `Idempotent-Replayed`): nothing new was created. */
  readonly replayed: boolean;
}

/** Core's documented bound (1–200); whether Core trims is not known, so the UI checks the trimmed name. */
export const PLATFORM_NAME_MAX = 200;

/**
 * A name (user data, either direction) inside a translated sentence: wrapped in Unicode isolates (FSI … PDI), so a Latin
 * name in an Arabic sentence, or the reverse, never reorders the text around it.
 */
export const isolated = (name: string): string => `\u2068${name}\u2069`;

export type PlatformNameProblem = 'required' | 'tooLong';

export function platformNameProblem(name: string): PlatformNameProblem | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'required';
  return trimmed.length > PLATFORM_NAME_MAX ? 'tooLong' : null;
}
