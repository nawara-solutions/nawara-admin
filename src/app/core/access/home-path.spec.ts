import { companyId, platformId } from '../context/scope.model';
import { homePath } from './home-path';

describe('homePath', () => {
  const operator = (ids: string[]) =>
    ({
      kind: 'operator',
      userId: 'p',
      email: null,
      platformAssignments: ids.map(platformId),
    }) as const;

  it('is the Company overview for an owner', () => {
    expect(
      homePath({ kind: 'owner', userId: 'o', email: 'o@x.invalid', companyId: companyId('c') }),
    ).toBe('/overview');
  });

  it('is an operator’s only Platform, or the platform choice for several', () => {
    expect(homePath(operator(['school']))).toBe('/platforms/school');
    expect(homePath(operator(['school', 'drive']))).toBe('/login/platform');
  });

  it('sends an operator with no assigned Platform to access denied, never the owner overview', () => {
    expect(homePath(operator([]))).toBe('/forbidden');
  });
});
