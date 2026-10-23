/**
 * What travels beside an administrative command (docs/CORE-INTEGRATION.md §8): one idempotency key per logical
 * operation, reused on retries, and the step-up token of the command's purpose, obtained immediately before sending.
 */
export interface CommandOptions {
  readonly idempotencyKey: string;
  readonly stepUpToken: string;
}

/** Core's `Idempotency-Key` format (organization-service `idempotency.service.ts`): 8–128 of `[A-Za-z0-9._:-]`. */
export const IDEMPOTENCY_KEY_FORMAT = /^[A-Za-z0-9._:-]{8,128}$/;
