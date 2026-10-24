import { TestBed } from '@angular/core/testing';
import en from '../../../../i18n/en.json';
import { membershipPath } from '../../../core/context/scope-context';
import { DemoWorld } from '../../../demo/world/demo-world';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID } from '../../../demo/world/seed';
import {
  HORIZON,
  SCHOOL,
  operatorOf,
  owner,
  renderMembers,
  text,
} from '../testing/members-testing';
import { MembershipDetailPage } from './membership-detail.page';

const A = en.organizations.members.account;

/** A membership of École Horizon, picked from the demo world before the page under test is rendered. */
async function membershipId(status: 'active' | 'pending'): Promise<string> {
  await renderMembers(MembershipDetailPage, owner, DEMO_OWNER_ID, '/');
  const id = TestBed.inject(DemoWorld)
    .snapshot()
    .memberships.find((m) => m.organizationId === HORIZON && m.status === status)!.id;
  TestBed.resetTestingModule();
  return id;
}

const card = (element: HTMLElement) =>
  element.querySelector<HTMLElement>('.membership-detail__account');

// Renders the real demo world; the timeout covers that rendering cost only.
describe('The "Nawara account" card (P5-S4, deferred)', { timeout: 15_000 }, () => {
  it('tells the owner account actions are not available yet, with no control and no inferred state', async () => {
    const id = await membershipId('active');
    const { element } = await renderMembers(
      MembershipDetailPage,
      owner,
      DEMO_OWNER_ID,
      membershipPath(SCHOOL, HORIZON, id),
    );
    const account = card(element);
    expect(account).not.toBeNull();
    expect(text(account?.querySelector('h2'))).toBe(A.title);
    expect(text(account)).toContain(A.difference);
    expect(text(account)).toContain(A.unavailableOwner);
    expect(text(account)).not.toContain(A.unavailableOperator);
    // Nothing to press, nothing to type; no account state is claimed from the membership.
    expect(account?.querySelectorAll('button, a, input, select, [role="button"]')).toHaveLength(0);
    // No account state is shown or claimed: no badge, no "is suspended" / "is active" statement.
    expect(account?.querySelector('nw-status-badge')).toBeNull();
    // ("…whether this account is suspended" is a question the card says it cannot answer, not a claim.)
    expect(text(account)).not.toMatch(/(^|[.!?]\s)(this|the) account is (suspended|active)/i);
  });

  it('tells an assigned operator the action is the Company owner’s, never offering account authority', async () => {
    const id = await membershipId('active');
    const { element } = await renderMembers(
      MembershipDetailPage,
      operatorOf(DEMO_OPERATOR_IDS.school),
      DEMO_OPERATOR_IDS.school,
      membershipPath(SCHOOL, HORIZON, id),
    );
    const account = card(element);
    expect(text(account)).toContain(A.unavailableOperator);
    expect(text(account)).not.toContain(A.unavailableOwner);
    expect(account?.querySelectorAll('button, a, input, select')).toHaveLength(0);
  });

  it('appears on any membership’s details, a pending request’s included, and says the same thing', async () => {
    const id = await membershipId('pending');
    const { element } = await renderMembers(
      MembershipDetailPage,
      owner,
      DEMO_OWNER_ID,
      membershipPath(SCHOOL, HORIZON, id),
    );
    expect(text(card(element))).toContain(A.unavailableOwner);
  });
});
