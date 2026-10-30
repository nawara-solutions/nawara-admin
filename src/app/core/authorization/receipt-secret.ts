import {
  dropReceiptSecretValue,
  holdReceiptSecretValue,
  isReceiptSecretValueHeld,
} from './receipt-secret-access';

/** Core's secret format: base64url of 32 random bytes (auth-service `src/receipts/dto.ts:118`; billing `refund-input.ts:56`). */
const SECRET_FORMAT = /^[A-Za-z0-9_-]{43}$/;

const REDACTED = '[receipt secret]';

/**
 * A receipt secret held in memory for ONE financial intent (F1-S3; docs/design/f1-financial-authorization.md §0.2, §6.3;
 * docs/CORE-INTEGRATION.md §11.12 E-3). It may have to outlive one send, because Core sanctions an identical repeat of the same
 * request for an unresolved answer; it is discarded when the intent ends.
 *
 * - No own property holds the value (see `receipt-secret-access.ts`): `String()`, template strings, `JSON.stringify`, `console`
 *   and Node's inspection all print `[receipt secret]`.
 * - Only `revealReceiptSecret` (ESLint-restricted to consumer HTTP adapters) reads it; `discard()` makes that throw.
 * - Never put in browser storage, a URL, router state, an `AppError`, a message or telemetry.
 *
 * Defence in depth only: a JavaScript string cannot be securely zeroed; `discard()` drops this module's only reference.
 */
export class ReceiptSecret {
  private constructor() {
    Object.freeze(this);
  }

  /** Holds a value Core issued. A malformed value is refused without echoing it. */
  static fromIssued(value: string): ReceiptSecret {
    if (!SECRET_FORMAT.test(value)) throw new TypeError('Malformed receipt secret.');
    const secret = new ReceiptSecret();
    holdReceiptSecretValue(secret, value);
    return secret;
  }

  /** Whether the value is still held (false after `discard()`). */
  get held(): boolean {
    return isReceiptSecretValueHeld(this);
  }

  /** Ends the intent's hold on the value. Idempotent. */
  discard(): void {
    dropReceiptSecretValue(this);
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  [Symbol.toPrimitive](): string {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}
