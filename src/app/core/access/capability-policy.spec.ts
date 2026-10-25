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
      'account.factor.add',
      'account.factor.remove',
      'account.secret_key.rotate',
      'account.security.view',
      'company.audit.view',
      'company.commercial.view',
      'company.operators.view',
      'company.overview.view',
      'company.platforms.view',
      'company.releases.view',
      'company.scope',
      'company.services.view',
      'company.settings.view',
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
    expect(can(operator, 'company.commercial.view')).toBe(false);
    // The activity browser (P8-S1) is the owner's: operators have no audit read in Core.
    expect(can(operator, 'company.audit.view')).toBe(false);
    expect(can(operator, 'company.services.view')).toBe(false);
    expect(can(operator, 'company.releases.view')).toBe(false);
    // Company settings (P9-S3) are the owner's: an assignment never confers Company configuration authority.
    expect(can(operator, 'company.settings.view')).toBe(false);
    // Account security (P9-S4a) is the owner's: operators have no factors and Core's factor routes refuse them.
    expect(can(operator, 'account.security.view')).toBe(false);
    // Adding an authenticator (P9-S4b) is the owner's own: Core's factors/totp routes are owner only.
    expect(can(operator, 'account.factor.add')).toBe(false);
    // Creating a secret key (P9-S4c) is the owner's own: Core's secret-key/rotate is owner only.
    expect(can(operator, 'account.secret_key.rotate')).toBe(false);
    // Removing a factor (P9-S4d) is the owner's own: Core's DELETE factors/:id is owner only.
    expect(can(operator, 'account.factor.remove')).toBe(false);
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
