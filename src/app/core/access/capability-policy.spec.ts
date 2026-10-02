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
  it('gives the Company owner company-wide administration and platform creation', () => {
    expect([...capabilitiesOf(owner)].sort()).toEqual([
      'company.overview.view',
      'company.platforms.view',
      'platform.create',
    ]);
  });

  it('never gives an operator company-wide access, whatever their platform assignments', () => {
    expect(capabilitiesOf(operator).size).toBe(0);
    expect(can(operator, 'company.overview.view')).toBe(false);
    expect(can(operator, 'company.platforms.view')).toBe(false);
    expect(can(operator, 'platform.create')).toBe(false);
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
