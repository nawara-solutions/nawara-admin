/**
 * Core's documented limits of an owner's new password (P9-S4-0, Core `304064f`, `POST /auth/admin/password/change`):
 * 10 to 72 characters, at most 72 bytes, no NUL character. Nothing else is required; Admin adds no rule of its own.
 *
 * Assumption (CF-59): Core's "characters" are counted as Unicode code points, and its bytes as UTF-8. A JavaScript
 * string's `length` counts UTF-16 units instead, so an emoji is 1 character here, 2 units there, 4 bytes. A string
 * holding an unpaired surrogate cannot be sent as UTF-8 faithfully, so it is refused here too. The password is never
 * trimmed or normalised: what is typed is what is checked and sent.
 */
export const PASSWORD_LIMITS = { minCharacters: 10, maxCharacters: 72, maxBytes: 72 } as const;

/** Each documented limit, met or not, for the page's live list. */
export interface PasswordCheck {
  readonly characters: number;
  readonly bytes: number;
  readonly lengthOk: boolean;
  readonly bytesOk: boolean;
  /** No NUL character and no unpaired surrogate. */
  readonly charactersOk: boolean;
  readonly ok: boolean;
}

const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function checkPassword(password: string): PasswordCheck {
  const characters = [...password].length;
  const bytes = new TextEncoder().encode(password).length;
  const lengthOk =
    characters >= PASSWORD_LIMITS.minCharacters && characters <= PASSWORD_LIMITS.maxCharacters;
  const bytesOk = bytes <= PASSWORD_LIMITS.maxBytes;
  const charactersOk = !password.includes('\u0000') && !UNPAIRED_SURROGATE.test(password);
  return {
    characters,
    bytes,
    lengthOk,
    bytesOk,
    charactersOk,
    ok: lengthOk && bytesOk && charactersOk,
  };
}
