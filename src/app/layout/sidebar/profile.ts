import { Actor } from '../../core/auth/actor';

const ROLE_KEYS = {
  owner: 'shell.role.owner',
  operator: 'shell.role.operator',
} as const;

export interface Profile {
  readonly name: string;
  readonly initials: string;
  readonly roleKey: (typeof ROLE_KEYS)[keyof typeof ROLE_KEYS];
}

/** The signed-in person as the shell shows them (sidebar card, top-bar avatar); `null` without a session. */
export function profileOf(actor: Actor | null): Profile | null {
  if (actor === null) return null;
  const name = actor.displayName ?? actor.email;
  const initials = name
    .split(/[\s@.]+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return { name, initials, roleKey: ROLE_KEYS[actor.kind] };
}
