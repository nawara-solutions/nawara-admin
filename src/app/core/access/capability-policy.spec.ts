import { OperatorActor, OwnerActor } from '../auth/actor';
import { companyId, platformId } from '../context/scope.model';
import { can, canEnterPlatform, capabilitiesOf } from './capability-policy';

const SCHOOL = platformId('platform-school');
const DRIVE = platformId('platform-drive');
const OTHER = platformId('platform-of-another-company');

const owner: OwnerActor = {
  kind: 'owner',
  userId: 'owner-1',
  email: 'owner@example.invalid',
  companyId: companyId('company-1'),
};
const operator: OperatorActor = {
  kind: 'operator',
  userId: 'operator-1',
  email: 'operator@example.invalid',
  platformAssignments: [SCHOOL, DRIVE],
};

describe('CapabilityPolicy (UX only; Core authorizes)', () => {
  it('gives the Company owner company-wide administration, platform and organization creation', () => {
    expect([...capabilitiesOf(owner)].sort()).toEqual([
      'company.operators.view',
      'company.overview.view',
      'company.platforms.view',
      'company.scope',
      'operator.account.block',
      'operator.create',
      'operator.platformAccess.change',
      'organization.create',
      'platform.access.view',
      'platform.activity.view',
      'platform.commercial.view',
      'platform.create',
    ]);
  });

  it('never gives an operator company-wide access, whatever their platform assignments', () => {
    expect(capabilitiesOf(operator).size).toBe(0);
    expect(can(operator, 'company.scope')).toBe(false);
    expect(can(operator, 'platform.commercial.view')).toBe(false);
    expect(can(operator, 'platform.activity.view')).toBe(false);
    expect(can(operator, 'platform.access.view')).toBe(false);
    expect(can(operator, 'company.overview.view')).toBe(false);
    expect(can(operator, 'operator.create')).toBe(false);
    expect(can(operator, 'company.platforms.view')).toBe(false);
    // The Company's staff directory is the owner's; an operator's authority is their assignments only (P6-S1).
    expect(can(operator, 'company.operators.view')).toBe(false);
    // Platform access is changed by the owner only (P6-S2): never by an operator, on any record.
    expect(can(operator, 'operator.platformAccess.change')).toBe(false);
    expect(can(operator, 'operator.account.block')).toBe(false);
    expect(can(operator, 'platform.create')).toBe(false);
    // Core authorizes an assigned operator to create Organizations, but no operator step-up exists (CF-08).
    expect(can(operator, 'organization.create')).toBe(false);
  });

  it('gives nothing without a session', () => {
    expect(capabilitiesOf(null).size).toBe(0);
  });

  describe('entering a platform scope (mirrors GET /auth/platform-access/:platformId)', () => {
    const companyPlatforms = [SCHOOL, DRIVE];

    it('lets the owner enter any platform of their Company, and no other', () => {
      expect(canEnterPlatform(owner, SCHOOL, companyPlatforms)).toBe(true);
      expect(canEnterPlatform(owner, OTHER, companyPlatforms)).toBe(false);
    });

    it('lets an operator enter only an assigned platform', () => {
      const assignedToSchool: OperatorActor = { ...operator, platformAssignments: [SCHOOL] };
      expect(canEnterPlatform(assignedToSchool, SCHOOL, companyPlatforms)).toBe(true);
      expect(canEnterPlatform(assignedToSchool, DRIVE, companyPlatforms)).toBe(false);
    });

    it('lets nobody in without a session', () => {
      expect(canEnterPlatform(null, SCHOOL, companyPlatforms)).toBe(false);
    });
  });
});
