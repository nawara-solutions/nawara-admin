import { RESTRICTION_CLEARS } from './assistance-oversight';
import {
  NOT_RESTRICTIONS,
  RESTRICTION_ENDS,
  RESTRICTION_SINCE,
  RESTRICTION_SOURCE,
  restrictionCasePath,
  restrictionKinds,
  restrictionRelation,
} from './assistance-restrictions';
import { AssistanceRestrictionRow } from './assistance.model';

const detail = {
  request: { id: 'r-1' },
  cashReturns: [{ id: 'o-1' }],
  recoveryObligationId: 'ro-1',
} as unknown as Parameters<typeof restrictionRelation>[1];

const row = (
  kind: AssistanceRestrictionRow['kind'],
  sourceId: string,
): AssistanceRestrictionRow => ({
  kind,
  sourceId,
  since: '2026-10-30T00:00:00.000Z',
});

describe('Assistance restrictions (A10): reading Core’s rows', () => {
  it('names what each kind rests on and what its since means (BIL-26 RestrictionDto)', () => {
    expect(RESTRICTION_SOURCE).toEqual({ T1: 'request', T2: 'cashReturn', T3: 'recovery' });
    expect(RESTRICTION_SINCE).toEqual({
      T1: 'deadlinePassed',
      T2: 'obligationOpened',
      T3: 'obligationOpened',
    });
  });

  it('ends each kind only as Core’s model does: the same reading as the A6 oversight, no timer', () => {
    expect(RESTRICTION_ENDS).toBe(RESTRICTION_CLEARS);
    expect(Object.values(RESTRICTION_ENDS).join(' ')).not.toMatch(/day|hour|expire|timer|manual/i);
  });

  it('tells this case’s rows from another case’s, by the record each rests on', () => {
    expect(restrictionRelation(row('T1', 'r-1'), detail)).toBe('thisCase');
    expect(restrictionRelation(row('T1', 'r-2'), detail)).toBe('otherCase');
    expect(restrictionRelation(row('T2', 'o-1'), detail)).toBe('thisCase');
    expect(restrictionRelation(row('T2', 'r-1'), detail)).toBe('otherCase');
    expect(restrictionRelation(row('T3', 'ro-1'), detail)).toBe('thisCase');
    expect(restrictionRelation(row('T3', 'o-1'), detail)).toBe('otherCase');
  });

  it('opens a case only from a T1 row: an obligation id never resolves to a request (CF-70, CF-68)', () => {
    expect(restrictionCasePath(row('T1', 'r-2'))).toBe('/billing/assistance/r-2');
    expect(restrictionCasePath(row('T2', 'o-2'))).toBeNull();
    expect(restrictionCasePath(row('T3', 'ro-2'))).toBeNull();
  });

  it('lists the distinct kinds in Core’s order', () => {
    expect(restrictionKinds([row('T3', 'a'), row('T1', 'b'), row('T1', 'c')])).toEqual([
      'T1',
      'T3',
    ]);
    expect(restrictionKinds([])).toEqual([]);
  });

  it('keeps assistance disputes, Payment disputes, fraud holds and D6 apart from T1/T2/T3', () => {
    expect(NOT_RESTRICTIONS).toEqual([
      'assistanceDispute',
      'paymentDispute',
      'fraudHold',
      'inactivity',
    ]);
  });
});
