import {
  applyQuery,
  DEFAULT_QUERY,
  DirectoryRow,
  parseQuery,
  toQueryParams,
} from './organization-query';
import {
  ATLAS,
  HORIZON,
  NOW,
  RIAD,
  commercialListOf,
  directoryOf,
  summaryOf,
} from '../testing/organizations-testing';
import { organizationId } from '../../../core/context/scope.model';

const collator = new Intl.Collator('fr', { sensitivity: 'base' });
const facts = new Map(commercialListOf().organizations.map((c) => [c.organizationId, c]));
const rows: readonly DirectoryRow[] = directoryOf().organizations.map((organization) => ({
  organization,
  commercial: facts.get(organization.id) ?? null,
}));
const ids = (result: readonly DirectoryRow[]) => result.map((r) => r.organization.id);
const run = (query: Partial<typeof DEFAULT_QUERY>, subscriptions = true) =>
  ids(applyQuery(rows, { ...DEFAULT_QUERY, ...query }, { now: NOW, collator, subscriptions }));

describe('Organization directory query (URL state)', () => {
  it('parses query parameters, falling back to defaults for anything unknown or malformed', () => {
    expect(parseQuery({})).toEqual(DEFAULT_QUERY);
    expect(parseQuery({ q: 'riad', requests: '1', subscription: 'ending', sort: 'name' })).toEqual({
      q: 'riad',
      requests: true,
      subscription: 'ending',
      sort: 'name',
    });
    expect(
      parseQuery({ q: ['a', 'b'], requests: 'yes', subscription: 'paid', sort: 'DROP' }),
    ).toEqual(DEFAULT_QUERY);
    expect(parseQuery({ q: 'x'.repeat(500) }).q).toHaveLength(200);
  });

  it('writes only what differs from the defaults, and round-trips', () => {
    expect(toQueryParams(DEFAULT_QUERY)).toEqual({});
    expect(toQueryParams({ ...DEFAULT_QUERY, q: '   ' })).toEqual({});
    const query = { q: 'école', requests: true, subscription: 'grace', sort: 'requests' } as const;
    expect(parseQuery(toQueryParams(query))).toEqual(query);
  });

  it('searches names without regard to case or accents', () => {
    expect(run({ q: 'ecole' })).toEqual([HORIZON]);
    expect(run({ q: 'COLLÈGE' })).toEqual([RIAD]);
    expect(run({ q: '  savoir ' })).toEqual([ATLAS]);
    expect(run({ q: 'nothing' })).toEqual([]);
  });

  it('keeps only Organizations with pending requests', () => {
    expect(run({ requests: true })).toEqual([HORIZON, RIAD]);
  });

  it('sorts by creation date, name, memberships and requests, with a stable tie-break', () => {
    expect(run({})).toEqual([HORIZON, RIAD, ATLAS]);
    expect(run({ sort: 'oldest' })).toEqual([ATLAS, RIAD, HORIZON]);
    expect(run({ sort: 'name' })).toEqual([RIAD, HORIZON, ATLAS]);
    expect(run({ sort: 'memberships' })).toEqual([RIAD, HORIZON, ATLAS]);
    expect(run({ sort: 'requests' })).toEqual([RIAD, HORIZON, ATLAS]);
    const twins: DirectoryRow[] = [
      {
        organization: summaryOf(organizationId('b'), 'Same', '2026-01-01T00:00:00Z', 1, 0),
        commercial: null,
      },
      {
        organization: summaryOf(organizationId('a'), 'Same', '2026-01-01T00:00:00Z', 1, 0),
        commercial: null,
      },
    ];
    expect(
      ids(applyQuery(twins, DEFAULT_QUERY, { now: NOW, collator, subscriptions: false })),
    ).toEqual(['a', 'b']);
  });

  it('filters by subscription (the owner’s, with the facts loaded), with the 14-day “ending” threshold', () => {
    expect(run({ subscription: 'active' })).toEqual([HORIZON, RIAD]);
    expect(run({ subscription: 'ending' })).toEqual([RIAD]);
    expect(run({ subscription: 'none' })).toEqual([ATLAS]);
    expect(run({ subscription: 'grace' })).toEqual([]);
    // Without the commercial facts (an operator, or an outage) the filter is ignored, never guessed.
    expect(run({ subscription: 'none' }, false)).toEqual([HORIZON, RIAD, ATLAS]);
  });

  it('sorts unknown counts last', () => {
    const unknown: DirectoryRow = {
      organization: {
        ...summaryOf(organizationId('u'), 'Unknown', '2026-01-01T00:00:00Z', 0, 0),
        memberships: { status: 'unavailable' },
      },
      commercial: null,
    };
    expect(
      ids(
        applyQuery(
          [unknown, ...rows],
          { ...DEFAULT_QUERY, sort: 'memberships' },
          { now: NOW, collator, subscriptions: false },
        ),
      ).at(-1),
    ).toBe('u');
  });
});
