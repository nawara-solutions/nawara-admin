/**
 * The identifier an operator types to request a working code: an email address or a phone number, exactly one
 * (Core's `OperatorRequestCodeDto`). The checks mirror Core's own normalization (`users.service.ts`): an email is
 * trimmed and lower-cased; a phone number loses its spaces, brackets and dashes and must then match
 * `^\+?[0-9]{8,15}$`. They are UX only: Core validates again and decides everything else.
 */
export type OperatorIdentifier =
  | { readonly kind: 'email'; readonly email: string }
  | { readonly kind: 'phone'; readonly phone: string };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_SHAPE = /^\+?[0-9]{8,15}$/;

/** Core's phone normalization: spaces, brackets and dashes are formatting, not digits. */
export const normalizePhone = (value: string): string => value.replace(/[\s()-]/g, '');

/** The identifier this text names, or `null` when it is neither a valid email nor a valid phone number. */
export function parseOperatorIdentifier(text: string): OperatorIdentifier | null {
  const value = text.trim();
  if (value === '') return null;
  if (value.includes('@')) {
    return EMAIL_SHAPE.test(value) ? { kind: 'email', email: value.toLowerCase() } : null;
  }
  const phone = normalizePhone(value);
  return PHONE_SHAPE.test(phone) ? { kind: 'phone', phone } : null;
}

/** The identifier as shown back to the operator (a machine value: always rendered left-to-right). */
export const identifierText = (identifier: OperatorIdentifier): string =>
  identifier.kind === 'email' ? identifier.email : identifier.phone;
