/**
 * The ONLY way to read a receipt secret's value (F1-S3; docs/design/f1-financial-authorization.md §0.2, §6.3). ESLint restricts
 * importing this module to future consumer HTTP adapters (`*.http.ts`) and `receipt-secret.ts` (eslint.config.js
 * `RECEIPT_SECRET_ACCESS`); no such adapter exists yet.
 *
 * The values live in a module-private `WeakMap`, so a holder carries no own property with the secret: inspecting, logging or
 * serializing the holder never reaches it. This is defence in depth, not secret protection: the value is an ordinary JavaScript
 * string, which cannot be zeroed and may remain in memory (and in heap snapshots) until garbage collected.
 */

const values = new WeakMap<object, string>();

/** Thrown when a discarded (or never-held) secret is read. Carries no part of any secret. */
export class ReceiptSecretUnavailableError extends Error {
  constructor() {
    super('The receipt secret is no longer held.');
    this.name = 'ReceiptSecretUnavailableError';
  }
}

/** Associates a value with its holder (used by `ReceiptSecret` only). */
export function holdReceiptSecretValue(holder: object, value: string): void {
  values.set(holder, value);
}

/** Drops the only reference this module keeps (used by `ReceiptSecret.discard()`). */
export function dropReceiptSecretValue(holder: object): void {
  values.delete(holder);
}

export function isReceiptSecretValueHeld(holder: object): boolean {
  return values.has(holder);
}

/**
 * The secret's value, for a consumer adapter to put in exactly one request body (`receiptSecret`). Never log, store, put in a
 * URL, an error or telemetry what this returns. Throws once the secret is discarded.
 */
export function revealReceiptSecret(holder: object): string {
  const value = values.get(holder);
  if (value === undefined) throw new ReceiptSecretUnavailableError();
  return value;
}
