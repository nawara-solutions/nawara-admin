import { platformId } from '../../../core/context/scope.model';
import { OperatorSummary } from '../domain/operator.model';
import {
  DEFAULT_OPERATOR_QUERY,
  applyOperatorQuery,
  parseOperatorQuery,
  toOperatorQueryParams,
} from './operator-query';

const S = platformId('5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b01');
const D = platformId('5b8d2a10-3c4e-4f61-8a2b-9d0e1f2a3b02');

const op = (
  id: string,
  contact: OperatorSummary['contact'],
  platforms: OperatorSummary['activePlatformIds'],
  accountState: OperatorSummary['accountState'] = 'canSignIn',
  createdAt = '2026-01-01T00:00:00.000Z',
): OperatorSummary => ({ id, contact, accountState, activePlatformIds: platforms, createdAt });

const ROWS: readonly OperatorSummary[] = [
  op('a', { kind: 'email', email: 'zed@x.invalid' }, [S], 'canSignIn', '2026-03-01T00:00:00.000Z'),
  op(
    'b',
    { kind: 'email', email: 'amy@x.invalid' },
    [S, D],
    'canSignIn',
    '2026-01-01T00:00:00.000Z',
  ),
  op('c', { kind: 'phone', phone: '+99900000001' }, [D], 'canSignIn', '2026-02-01T00:00:00.000Z'),
  op('d', { kind: 'email', email: 'émile@x.invalid' }, [], 'blocked', '2026-04-01T00:00:00.000Z'),
  op(
    'e',
    { kind: 'email', email: 'new@x.invalid' },
    [S],
    'awaitingConfirmation',
    '2026-05-01T00:00:00.000Z',
  ),
];

const collator = new Intl.Collator('en', { sensitivity: 'base' });
const ids = (rows: readonly OperatorSummary[]) => rows.map((r) => r.id);
const run = (query: Partial<typeof DEFAULT_OPERATOR_QUERY>, search = '') =>
  ids(applyOperatorQuery(ROWS, { ...DEFAULT_OPERATOR_QUERY, ...query }, search, collator));

describe('operator query: URL parameters', () => {
  it('reads the Platform filter, the state filter and the sort; anything unknown falls back to the default', () => {
    expect(parseOperatorQuery({})).toEqual(DEFAULT_OPERATOR_QUERY);
    expect(parseOperatorQuery({ platform: S, state: 'blocked', sort: 'newest' })).toEqual({
      platform: S,
      state: 'blocked',
      sort: 'newest',
    });
    expect(parseOperatorQuery({ platform: 'none' }).platform).toBe('none');
    expect(parseOperatorQuery({ platform: 'nawara-school', state: 'x', sort: 'y' })).toEqual(
      DEFAULT_OPERATOR_QUERY,
    );
    expect(parseOperatorQuery({ platform: S.toUpperCase() }).platform).toBe(S);
  });

  it('writes only what differs from the default, and never a search (contacts stay out of URLs)', () => {
    expect(toOperatorQueryParams(DEFAULT_OPERATOR_QUERY)).toEqual({});
    expect(
      toOperatorQueryParams({ platform: 'none', state: 'canSignIn', sort: 'platforms' }),
    ).toEqual({
      platform: 'none',
      state: 'canSignIn',
      sort: 'platforms',
    });
    expect(Object.keys(toOperatorQueryParams({ ...DEFAULT_OPERATOR_QUERY, platform: D }))).toEqual([
      'platform',
    ]);
  });
});

describe('operator query: search, filters and sort', () => {
  it('sorts by contact by default, accent- and case-insensitively', () => {
    expect(run({})).toEqual(['c', 'b', 'd', 'e', 'a']);
  });

  it('searches emails and phones, a phone also by its digits as typed with formatting', () => {
    expect(run({}, 'AMY')).toEqual(['b']);
    expect(run({}, 'emile')).toEqual(['d']);
    expect(run({}, '+999 (0000) 0001')).toEqual(['c']);
    expect(run({}, '0000')).toEqual(['c']);
    expect(run({}, '  ')).toHaveLength(ROWS.length);
    expect(run({}, 'nobody')).toEqual([]);
  });

  it('filters by an active Platform, or by no Platform access', () => {
    expect(run({ platform: S })).toEqual(['b', 'e', 'a']);
    expect(run({ platform: D })).toEqual(['c', 'b']);
    expect(run({ platform: 'none' })).toEqual(['d']);
  });

  it('filters by account state and combines every filter', () => {
    expect(run({ state: 'blocked' })).toEqual(['d']);
    expect(run({ state: 'awaitingConfirmation' })).toEqual(['e']);
    expect(run({ state: 'canSignIn', platform: S }, 'z')).toEqual(['a']);
  });

  it('sorts by most Platforms and by newest, ties by contact', () => {
    expect(run({ sort: 'platforms' })).toEqual(['b', 'c', 'e', 'a', 'd']);
    expect(run({ sort: 'newest' })).toEqual(['e', 'd', 'a', 'c', 'b']);
  });

  it('never changes the loaded list', () => {
    const before = ids(ROWS);
    run({ sort: 'newest' }, 'x');
    expect(ids(ROWS)).toEqual(before);
  });
});
