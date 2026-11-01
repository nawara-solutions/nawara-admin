import { platformId } from '../../../core/context/scope.model';
import {
  DEFAULT_DIRECTORY_QUERY,
  directoryParamsOf,
  directoryQueryOf,
} from './assistance-directory.facade';
import { disputesQueryOf } from './assistance-disputes.facade';
import { recoveryQueryOf } from './assistance-recovery.facade';
import { settlementsQueryOf } from './assistance-settlements.facade';
import { RETURN_STATE_KEY, assistanceReturnOf } from './assistance-url-state';

const REF = 'a551c0de-0000-4000-8000-00000000010b';

describe('Assistance URL state (A11): reading untrusted addresses', () => {
  it('the plain directory address is the default view', () => {
    expect(directoryQueryOf({})).toEqual(DEFAULT_DIRECTORY_QUERY);
  });

  it('reads every directory filter, the order and the search, and writes them back without defaults', () => {
    const params = {
      ref: REF.toUpperCase(),
      platform: 'p-1',
      state: 'cash_collected',
      channel: 'closed',
      attention: 'overdue',
      order: 'consentOldest',
    };
    const query = directoryQueryOf(params);
    expect(query).toEqual({
      reference: REF,
      platform: platformId('p-1'),
      state: 'cash_collected',
      channel: 'closed',
      indicator: 'overdue',
      order: 'consentOldest',
    });
    expect(directoryParamsOf(query)).toEqual({ ...params, ref: REF });
    expect(directoryParamsOf(DEFAULT_DIRECTORY_QUERY)).toEqual({
      ref: null,
      platform: null,
      state: null,
      channel: null,
      attention: null,
      order: null,
    });
  });

  it('drops values outside Core’s closed sets, partial references and repeated parameters; nothing is guessed', () => {
    expect(
      directoryQueryOf({
        ref: REF.slice(0, 8),
        state: 'paid',
        channel: 'refunded',
        attention: 'everything',
        order: 'amount',
        platform: ['p-1', 'p-2'],
      }),
    ).toEqual(DEFAULT_DIRECTORY_QUERY);
  });

  it('reads the disputes overview: open by default, `all` for every state, Core reasons and exceptions only', () => {
    expect(disputesQueryOf({})).toEqual({
      disputes: { state: 'open', reason: null },
      exception: 'collectionReportedNotSettled',
    });
    expect(
      disputesQueryOf({
        state: 'all',
        reason: 'cash_not_returned',
        exception: 'recoveryRestriction',
      }),
    ).toEqual({
      disputes: { state: null, reason: 'cash_not_returned' },
      exception: 'recoveryRestriction',
    });
    expect(disputesQueryOf({ state: 'rejected', reason: 'refund', exception: 'paid' })).toEqual(
      disputesQueryOf({}),
    );
  });

  it('reads the settlements overview’s two lists and the recovery overview', () => {
    expect(
      settlementsQueryOf({ late: 'unapplied', return: 'return_reported', disputed: 'true' }),
    ).toEqual({
      late: { status: 'unapplied' },
      returns: { state: 'return_reported', disputed: true },
    });
    expect(
      settlementsQueryOf({ late: 'pending', return: 'partially_returned', disputed: 'yes' }),
    ).toEqual({
      late: { status: null },
      returns: { state: null, disputed: null },
    });
    expect(recoveryQueryOf({ state: 'recovered', surplus: 'owed' })).toEqual({
      state: 'recovered',
      surplusOwed: true,
    });
    expect(recoveryQueryOf({ state: 'written_off', surplus: 'yes' })).toEqual({
      state: null,
      surplusOwed: null,
    });
  });
});

describe('Assistance URL state (A11): the way back from a case', () => {
  it('returns to the list the case was opened from, with its filters', () => {
    expect(
      assistanceReturnOf({ [RETURN_STATE_KEY]: '/billing/assistance?attention=disputed' }),
    ).toEqual({ page: 'directory', url: '/billing/assistance?attention=disputed' });
    expect(
      assistanceReturnOf({ [RETURN_STATE_KEY]: '/billing/assistance/disputes?state=all' }),
    ).toEqual({ page: 'disputes', url: '/billing/assistance/disputes?state=all' });
    expect(assistanceReturnOf({ [RETURN_STATE_KEY]: '/billing/assistance/settlements' }).page).toBe(
      'settlements',
    );
    expect(assistanceReturnOf({ [RETURN_STATE_KEY]: '/billing/assistance/recovery' }).page).toBe(
      'recovery',
    );
  });

  it('falls back to the directory for a deep link or any other address (never an open redirect)', () => {
    const directory = { page: 'directory', url: '/billing/assistance' };
    for (const state of [
      null,
      undefined,
      'x',
      {},
      { navigationId: 3 },
      { [RETURN_STATE_KEY]: 7 },
      { [RETURN_STATE_KEY]: 'https://evil.invalid/billing/assistance' },
      { [RETURN_STATE_KEY]: '//evil.invalid/billing/assistance' },
      { [RETURN_STATE_KEY]: '/billing' },
      { [RETURN_STATE_KEY]: `/billing/assistance/${REF}` },
      { [RETURN_STATE_KEY]: '/billing/assistance#top' },
      { [RETURN_STATE_KEY]: '/settings/security' },
    ])
      expect(assistanceReturnOf(state)).toEqual(directory);
  });
});
