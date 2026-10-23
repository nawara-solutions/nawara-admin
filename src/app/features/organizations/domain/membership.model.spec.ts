import {
  Membership,
  applyMembersQuery,
  memberIdentity,
  parseMembersQuery,
  toMembersQueryParams,
} from './membership.model';

const m = (change: Partial<Membership>): Membership => ({
  id: 'm',
  userId: 'user-00000000abcd1234',
  status: 'active',
  requestedAt: '2026-10-20T00:00:00.000Z',
  approvedAt: '2026-10-20T01:00:00.000Z',
  rejectedAt: null,
  isOrganizationAdmin: false,
  email: null,
  phone: null,
  audience: 'student',
  contactVerified: true,
  ...change,
});
const collator = new Intl.Collator('en', { sensitivity: 'base' });

describe('memberships (pure rules)', () => {
  it('identifies a member by email, else phone, else a short neutral reference: never a name', () => {
    expect(memberIdentity(m({ email: 'a@x.invalid', phone: '+999' }))).toEqual({
      kind: 'email',
      value: 'a@x.invalid',
    });
    expect(memberIdentity(m({ phone: '+999500000001' }))).toEqual({
      kind: 'phone',
      value: '+999500000001',
    });
    expect(memberIdentity(m({}))).toEqual({ kind: 'user', value: 'abcd1234' });
  });

  it('reads the tab, the admins filter and the sort from the URL, defaulting to Active, and never the search', () => {
    expect(parseMembersQuery({})).toEqual({ status: 'active', admins: false, sort: 'newest' });
    expect(
      parseMembersQuery({ status: 'pending', admins: '1', sort: 'identity', q: 'a@b' }),
    ).toEqual({
      status: 'pending',
      admins: true,
      sort: 'identity',
    });
    // Core cannot list revoked memberships: the URL cannot ask for them.
    expect(parseMembersQuery({ status: 'revoked' }).status).toBe('active');
    expect(toMembersQueryParams({ status: 'active', admins: false, sort: 'newest' })).toEqual({});
    expect(toMembersQueryParams({ status: 'rejected', admins: true, sort: 'oldest' })).toEqual({
      status: 'rejected',
      admins: '1',
      sort: 'oldest',
    });
  });

  it('filters admins on the Active tab only, searches identity and audience without accents, and sorts', () => {
    const rows = [
      m({
        id: '1',
        email: 'zoe@x.invalid',
        requestedAt: '2026-10-01T00:00:00.000Z',
        isOrganizationAdmin: true,
        audience: 'org_admin',
      }),
      m({ id: '2', email: 'Élodie@x.invalid', requestedAt: '2026-10-03T00:00:00.000Z' }),
      m({
        id: '3',
        phone: '+999500000007',
        requestedAt: '2026-10-02T00:00:00.000Z',
        audience: 'teacher',
      }),
    ];
    const q = { status: 'active' as const, admins: false, sort: 'newest' as const };
    expect(applyMembersQuery(rows, q, '', collator).map((r) => r.id)).toEqual(['2', '3', '1']);
    expect(
      applyMembersQuery(rows, { ...q, sort: 'oldest' }, '', collator).map((r) => r.id),
    ).toEqual(['1', '3', '2']);
    expect(
      applyMembersQuery(rows, { ...q, sort: 'identity' }, '', collator).map((r) => r.id),
    ).toEqual(['3', '2', '1']);
    expect(applyMembersQuery(rows, { ...q, admins: true }, '', collator).map((r) => r.id)).toEqual([
      '1',
    ]);
    expect(
      applyMembersQuery(rows, { ...q, admins: true, status: 'pending' }, '', collator),
    ).toHaveLength(3);
    expect(applyMembersQuery(rows, q, 'elodie', collator).map((r) => r.id)).toEqual(['2']);
    expect(applyMembersQuery(rows, q, 'TEACH', collator).map((r) => r.id)).toEqual(['3']);
    expect(applyMembersQuery(rows, q, '0007', collator).map((r) => r.id)).toEqual(['3']);
  });
});
