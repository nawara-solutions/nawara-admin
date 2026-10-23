import {
  AdminInvitation,
  CLOCK_SKEW_MS,
  DEFAULT_EXPIRY,
  EXPIRY_PRESETS,
  creatorOf,
  invitationRequestOf,
  invitationTypeProblem,
  normaliseContact,
  possibleFromAttempt,
} from './admin-invitation.model';

const invitation = (change: Partial<AdminInvitation>): AdminInvitation => ({
  id: 'i',
  invitationType: 'org_admin',
  contactBound: false,
  expiresAt: '2026-10-30T00:00:00.000Z',
  createdAt: '2026-10-23T12:00:00.000Z',
  createdBy: 'me',
  consumedAt: null,
  revokedAt: null,
  status: 'active',
  ...change,
});

describe('admin invitations (pure rules)', () => {
  it('checks the type against Core’s pattern, the reserved word included, without changing it', () => {
    expect(invitationTypeProblem('')).toBe('required');
    expect(invitationTypeProblem('admin')).toBe('reserved');
    for (const bad of ['Admin', 'org admin', '1st', '_x', 'a'.repeat(33), 'été'])
      expect(invitationTypeProblem(bad)).toBe('invalid');
    for (const good of ['org_admin', 'manager', 'admins', 'a', 'x-1', 'a'.repeat(32)])
      expect(invitationTypeProblem(good)).toBeNull();
  });

  it('offers 1 hour, 24 hours (default), 3 days and 7 days, all within Core’s default range', () => {
    expect(EXPIRY_PRESETS).toEqual([60, 1440, 4320, 10_080]);
    expect(DEFAULT_EXPIRY).toBe(1440);
    expect(EXPIRY_PRESETS.every((m) => m >= 15 && m <= 10_080)).toBe(true);
  });

  it('normalizes a contact as Core: email trimmed and lowercased, phone stripped and checked; empty is none', () => {
    expect(normaliseContact('  ')).toEqual({ value: null });
    expect(normaliseContact(' Amina.K@Example.Invalid ')).toEqual({
      value: 'amina.k@example.invalid',
    });
    expect(normaliseContact('+213 (550) 00-00-00')).toEqual({ value: '+213550000000' });
    expect(normaliseContact('12345')).toEqual({ problem: 'invalidPhone' });
    expect(normaliseContact('x'.repeat(255))).toEqual({ problem: 'tooLong' });
  });

  it('sends exactly Core’s fields, omitting the contact when there is none', () => {
    expect(invitationRequestOf('org_admin', 60, null)).toEqual({
      invitationType: 'org_admin',
      expiresInMinutes: 60,
    });
    expect(invitationRequestOf('org_admin', 60, 'a@b.c')).toEqual({
      invitationType: 'org_admin',
      expiresInMinutes: 60,
      inviteeContact: 'a@b.c',
    });
  });

  it('names only the session’s own invitations “you”', () => {
    expect(creatorOf(invitation({}), 'me')).toBe('you');
    expect(creatorOf(invitation({ createdBy: 'someone' }), 'me')).toBe('someoneElse');
    expect(creatorOf(invitation({}), null)).toBe('someoneElse');
  });

  it('after a lost answer, marks only new, active invitations of this user created since the attempt', () => {
    const sentAt = Date.parse('2026-10-23T12:00:00.000Z');
    const attempt = { knownIds: new Set(['old']), sentAt, userId: 'me' };
    const marked = possibleFromAttempt(attempt, [
      invitation({ id: 'old' }),
      invitation({ id: 'new' }),
      invitation({ id: 'other', createdBy: 'someone' }),
      invitation({ id: 'revoked', status: 'revoked' }),
      invitation({ id: 'earlier', createdAt: new Date(sentAt - CLOCK_SKEW_MS - 1).toISOString() }),
    ]);
    expect([...marked]).toEqual(['new']);
  });
});
