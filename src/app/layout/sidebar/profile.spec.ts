import { companyId, platformId } from '../../core/context/scope.model';
import { profileOf } from './profile';

describe('profileOf', () => {
  it('names an owner by display name, with its initials', () => {
    expect(
      profileOf({
        kind: 'owner',
        userId: 'o',
        email: 'owner@x.invalid',
        displayName: 'Salim Anouar',
        companyId: companyId('c'),
      }),
    ).toEqual({ name: 'Salim Anouar', initials: 'SA', roleKey: 'shell.role.owner' });
  });

  it('falls back to the email, then to the phone of a phone-only operator', () => {
    const operator = {
      kind: 'operator',
      userId: 'p',
      platformAssignments: [platformId('s')],
    } as const;
    expect(profileOf({ ...operator, email: 'operator.school@x.invalid' })?.initials).toBe('OS');
    expect(profileOf({ ...operator, email: null, phone: '+99900000001' })).toEqual({
      name: '+99900000001',
      initials: '9',
      roleKey: 'shell.role.operator',
    });
  });
});
