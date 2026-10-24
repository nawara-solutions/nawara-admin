import { CommandOutcome } from '../demo-world';
import { DemoWorldTables, adminIdentityId } from '../records';
import { DEMO_OPERATOR_IDS, DEMO_OWNER_ID, demoWorldSeed } from '../seed';
import { assignmentHistoryOf, companyActivity, grantsOf, operatorProfileOf } from '../selectors';
import {
  OperatorCreation,
  contactKey,
  createOperator,
  createdOperatorId,
  worldContactKeys,
} from './operator.commands';

const NOW = Date.parse('2026-10-24T12:00:00Z');

const creation = (over: Partial<OperatorCreation> = {}): OperatorCreation => ({
  actor: DEMO_OWNER_ID,
  contact: { kind: 'email', email: 'new.operator@demo.nawara.invalid' },
  reservedContacts: new Set<string>(),
  now: NOW,
  ...over,
});

function ok<R>(outcome: CommandOutcome<R>): { world: DemoWorldTables; result: R } {
  if (!outcome.ok) throw new Error(`refused: ${outcome.error.kind}`);
  return outcome;
}

function refusal<R>(outcome: CommandOutcome<R>) {
  if (outcome.ok) throw new Error('accepted');
  return outcome.error;
}

describe('createOperator (P6-S4)', () => {
  let world: DemoWorldTables;
  beforeEach(() => (world = demoWorldSeed(NOW)));

  it('creates ONE unconfirmed, unblocked operator of the owner’s Company with no Platform access', () => {
    const { world: next, result } = ok(createOperator(creation())(world));
    expect(result).toEqual({
      id: createdOperatorId(world.sequence + 1),
      email: 'new.operator@demo.nawara.invalid',
      phone: null,
      isActive: true,
    });
    expect(next.operators.length).toBe(world.operators.length + 1);
    expect(operatorProfileOf(next, result.id)).toEqual({
      id: result.id,
      email: 'new.operator@demo.nawara.invalid',
      phone: null,
      createdAt: new Date(NOW).toISOString(),
      contactConfirmedAt: null,
      blocked: false,
    });
    expect(next.identities).toContainEqual({ id: result.id, kind: 'operator' });
    // An operator of the Company: no Company of its own, no assignment, no membership, no organization-admin role.
    expect(grantsOf(next, result.id)).toEqual({ companyId: null, platformAssignments: [] });
    expect(assignmentHistoryOf(next, result.id)).toEqual([]);
    expect(next.assignments).toBe(world.assignments);
    expect(next.memberships).toBe(world.memberships);
    expect(next.members).toBe(world.members);
    expect(next.memberships.some((m) => (m.userId as string) === result.id)).toBe(false);
  });

  it('records one Company-level operator.created activity with the id, never the contact', () => {
    const { world: next, result } = ok(createOperator(creation())(world));
    const added = next.activity.slice(world.activity.length);
    expect(added).toEqual([
      {
        id: `operator-activity-created-${world.sequence + 1}`,
        platformId: null,
        organizationId: null,
        action: 'operator.created',
        subjectId: result.id,
        occurredAt: new Date(NOW).toISOString(),
      },
    ]);
    expect(JSON.stringify(added)).not.toContain('new.operator');
    expect(companyActivity(next)[0]?.action).toBe('operator.created');
  });

  it('normalizes the contact as Core does: email lower-cased and trimmed, phone without formatting', () => {
    const email = ok(
      createOperator(
        creation({ contact: { kind: 'email', email: '  New.Operator@Demo.Nawara.INVALID ' } }),
      )(world),
    );
    expect(email.result.email).toBe('new.operator@demo.nawara.invalid');
    const phone = ok(
      createOperator(creation({ contact: { kind: 'phone', phone: '+999 (0000) 0042' } }))(world),
    );
    expect(phone.result).toMatchObject({ email: null, phone: '+99900000042' });
  });

  it('refuses a malformed contact, or one of the other kind, with 400 and changes nothing', () => {
    for (const contact of [
      { kind: 'email', email: 'not-an-email' },
      { kind: 'email', email: '+99900000042' },
      { kind: 'phone', phone: '12' },
      { kind: 'phone', phone: 'someone@demo.nawara.invalid' },
    ] as const) {
      const outcome = createOperator(creation({ contact }))(world);
      expect(refusal(outcome)).toMatchObject({ kind: 'validation', status: 400 });
    }
  });

  it('gives successive creations distinct, UUID-shaped ids that are never seed ids', () => {
    const first = ok(createOperator(creation())(world));
    const second = ok(
      createOperator(creation({ contact: { kind: 'email', email: 'second@demo.nawara.invalid' } }))(
        first.world,
      ),
    );
    expect(second.result.id).not.toBe(first.result.id);
    for (const id of [first.result.id, second.result.id])
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(world.operators.some((o) => o.id === first.result.id)).toBe(false);
  });

  describe('owner only, in the owner’s Company', () => {
    it('refuses an operator (even assigned), an anonymous caller and an owner of another Company with 403', () => {
      const foreignOwner = adminIdentityId('0d4e5f60-7a8b-4c9d-8e0f-1a2b3c4d5e6f');
      const withForeign: DemoWorldTables = {
        ...world,
        identities: [...world.identities, { id: foreignOwner, kind: 'owner' }],
      };
      for (const actor of [DEMO_OPERATOR_IDS.school, DEMO_OPERATOR_IDS.multi, null, foreignOwner]) {
        const outcome = createOperator(creation({ actor }))(withForeign);
        expect(refusal(outcome)).toMatchObject({ kind: 'forbidden', status: 403 });
      }
    });
  });

  describe('contact uniqueness across every account kind', () => {
    const conflict = { kind: 'conflict', code: 'account_already_exists', status: 409 };

    it('refuses an existing operator’s contact, whatever its case or formatting', () => {
      expect(
        refusal(
          createOperator(
            creation({ contact: { kind: 'email', email: 'OPERATOR.School@demo.nawara.invalid' } }),
          )(world),
        ),
      ).toEqual(conflict);
      expect(
        refusal(
          createOperator(creation({ contact: { kind: 'phone', phone: '+999 0000 0001' } }))(world),
        ),
      ).toEqual(conflict);
    });

    it('refuses a member’s contact (Core answers the same 409, never naming the account kind)', () => {
      const member = world.members.find((m) => m.email !== null)!;
      expect(
        refusal(
          createOperator(
            creation({ contact: { kind: 'email', email: member.email!.toUpperCase() } }),
          )(world),
        ),
      ).toEqual(conflict);
    });

    it('refuses a contact reserved by a sign-in account the world does not keep (the owner’s, a scenario’s)', () => {
      const reservedContacts = new Set([
        contactKey({ kind: 'email', email: 'owner@demo.nawara.invalid' }),
      ]);
      const outcome = createOperator(
        creation({
          contact: { kind: 'email', email: 'Owner@Demo.Nawara.invalid' },
          reservedContacts,
        }),
      )(world);
      expect(refusal(outcome)).toEqual(conflict);
    });

    it('refuses the contact of an operator created earlier', () => {
      const first = ok(createOperator(creation())(world));
      expect(refusal(createOperator(creation())(first.world))).toEqual(conflict);
    });

    it('compares values, not labels: an email never collides with a phone', () => {
      expect(contactKey({ kind: 'email', email: 'A@B.CD' })).toBe('email:a@b.cd');
      expect(contactKey({ kind: 'phone', phone: '+999 (0000) 0001' })).toBe('phone:+99900000001');
      expect(worldContactKeys(world).has('phone:+99900000001')).toBe(true);
    });
  });
});
