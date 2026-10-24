import { parseOperatorIdentifier } from '../../../core/auth/operator-identifier';
import { OperatorContact } from './operator.model';

/**
 * Creating an operator (P6-S4): the owner gives EXACTLY one contact, an email address or a phone number (Core's
 * `POST /auth/admin/operators` takes one of `email` or `phone`). The checks and the normalization are the sign-in
 * page's (`parseOperatorIdentifier`, mirroring Core's): an email trimmed and lower-cased, a phone without its spaces,
 * brackets and dashes. UX only: Core validates again (`400`) and decides uniqueness (`409`).
 */
export type ContactKind = OperatorContact['kind'];

export const CONTACT_KINDS: readonly ContactKind[] = ['email', 'phone'];

/** Why the typed contact cannot be sent. */
export type ContactProblem = 'required' | 'invalid';

/** The contact to send for the chosen kind, normalized; or what is wrong with it. */
export function parseNewOperatorContact(
  kind: ContactKind,
  text: string,
): { readonly contact: OperatorContact } | { readonly problem: ContactProblem } {
  if (text.trim() === '') return { problem: 'required' };
  const parsed = parseOperatorIdentifier(text);
  // An email typed in the phone field (or a number in the email field) is not the contact asked for.
  if (parsed === null || parsed.kind !== kind) return { problem: 'invalid' };
  return { contact: parsed };
}

/** Whether two normalized contacts are the same one (the same kind and value; never a display label). */
export const sameContact = (a: OperatorContact, b: OperatorContact): boolean =>
  a.kind === 'email'
    ? b.kind === 'email' && a.email === b.email
    : b.kind === 'phone' && a.phone === b.phone;
