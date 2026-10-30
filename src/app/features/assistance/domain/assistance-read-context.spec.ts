import { Actor } from '../../../core/auth/actor';
import { AdminScope, companyId, platformId } from '../../../core/context/scope.model';
import {
  AssistanceReadContext,
  assistanceReadContext,
  filterInContext,
  recordInContext,
  selectionId,
} from './assistance-read-context';

const COMPANY = companyId('c0000000-0000-4000-8000-000000000001');
const SCHOOL = platformId('p0000000-0000-4000-8000-000000000001');
const DRIVE = platformId('p0000000-0000-4000-8000-000000000002');
const OTHER = platformId('p0000000-0000-4000-8000-000000000009');

const OWNER: Actor = {
  kind: 'owner',
  userId: 'owner-1',
  email: 'owner@example.test',
  companyId: COMPANY,
};
const OPERATOR: Actor = {
  kind: 'operator',
  userId: 'operator-1',
  email: 'operator@example.test',
  platformAssignments: [SCHOOL],
};
const COMPANY_SCOPE: AdminScope = { kind: 'company' };
const SCHOOL_SCOPE: AdminScope = { kind: 'platform', platformId: SCHOOL };

describe('assistanceReadContext (Assistance A2)', () => {
  it("company scope: the owner's Company, every Platform", () => {
    expect(assistanceReadContext(OWNER, COMPANY_SCOPE, null)).toEqual({
      ok: true,
      context: { companyId: COMPANY, platformId: null },
    });
  });

  it('Platform scope: only a Platform of the Company', () => {
    expect(assistanceReadContext(OWNER, SCHOOL_SCOPE, [SCHOOL, DRIVE])).toEqual({
      ok: true,
      context: { companyId: COMPANY, platformId: SCHOOL },
    });
    expect(
      assistanceReadContext(OWNER, { kind: 'platform', platformId: OTHER }, [SCHOOL, DRIVE]),
    ).toEqual({ ok: false, refusal: 'platformNotInCompany' });
  });

  it('missing context is refused, never guessed', () => {
    expect(assistanceReadContext(null, COMPANY_SCOPE, [SCHOOL])).toEqual({
      ok: false,
      refusal: 'signedOut',
    });
    expect(assistanceReadContext(OWNER, null, [SCHOOL])).toEqual({ ok: false, refusal: 'noScope' });
    expect(assistanceReadContext(OWNER, SCHOOL_SCOPE, null)).toEqual({
      ok: false,
      refusal: 'platformsUnknown',
    });
  });

  it('an operator is refused, even on an assigned Platform (owner reads only)', () => {
    expect(assistanceReadContext(OPERATOR, SCHOOL_SCOPE, [SCHOOL])).toEqual({
      ok: false,
      refusal: 'notOwner',
    });
    expect(assistanceReadContext(OPERATOR, COMPANY_SCOPE, null)).toEqual({
      ok: false,
      refusal: 'notOwner',
    });
  });
});

describe('scoped selection (Assistance A2)', () => {
  const company: AssistanceReadContext = { companyId: COMPANY, platformId: null };
  const school: AssistanceReadContext = { companyId: COMPANY, platformId: SCHOOL };

  it('a filter can narrow a Platform scope, never widen or switch it', () => {
    expect(filterInContext(company, {})).toBe(true);
    expect(filterInContext(company, { platformId: DRIVE })).toBe(true);
    expect(filterInContext(school, {})).toBe(true);
    expect(filterInContext(school, { platformId: SCHOOL })).toBe(true);
    expect(filterInContext(school, { platformId: DRIVE })).toBe(false);
  });

  it("another Platform's record is out of context (shown as not found)", () => {
    expect(recordInContext(company, { platformId: DRIVE })).toBe(true);
    expect(recordInContext(school, { platformId: SCHOOL })).toBe(true);
    expect(recordInContext(school, { platformId: DRIVE })).toBe(false);
  });

  it("ids are Core's canonical UUIDs; anything else is not found and never sent", () => {
    const id = 'A0B1C2D3-0000-4000-8000-00000000000F';
    expect(selectionId({ kind: 'case', requestId: id })).toBe(id.toLowerCase());
    expect(selectionId({ kind: 'lateSettlement', lateSettlementId: id })).toBe(id.toLowerCase());
    expect(selectionId({ kind: 'recoveryObligation', obligationId: id })).toBe(id.toLowerCase());
    for (const bad of ['', 'case-1', '../admin', `${id} `, `${id}0`])
      expect(selectionId({ kind: 'case', requestId: bad })).toBeNull();
  });
});
