import { Actor } from '../auth/actor';
import { platformAccessOf } from './platform-access';
import { PlatformRef, companyId, platformId } from './scope.model';

const SCHOOL = platformId('school');
const DRIVE = platformId('drive');
const PLATFORMS: readonly PlatformRef[] = [
  { id: SCHOOL, name: 'Nawara School', key: null, product: 'school' },
  { id: DRIVE, name: 'Nawara Drive', key: null, product: 'drive' },
];
const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: null,
  platformAssignments: [SCHOOL],
};
const platform = (id: typeof SCHOOL) => ({ kind: 'platform', platformId: id }) as const;
const listed = { status: 'success', data: PLATFORMS } as const;

describe('platformAccessOf (UX mirror of Core’s platform access)', () => {
  it('checks while the actor’s Platforms load, and reports an outage apart from a refusal', () => {
    expect(platformAccessOf(platform(SCHOOL), { status: 'loading' }, owner)).toEqual({
      status: 'checking',
    });
    expect(platformAccessOf(platform(SCHOOL), { status: 'idle' }, owner)).toEqual({
      status: 'checking',
    });
    expect(
      platformAccessOf(
        platform(SCHOOL),
        { status: 'error', error: { kind: 'unavailable', status: 503 } },
        owner,
      ),
    ).toEqual({ status: 'directoryUnavailable' });
  });

  it('grants the owner any listed Platform, and an operator only an assigned one', () => {
    expect(platformAccessOf(platform(DRIVE), listed, owner)).toEqual({
      status: 'granted',
      platform: PLATFORMS[1],
    });
    expect(platformAccessOf(platform(SCHOOL), listed, operator)).toEqual({
      status: 'granted',
      platform: PLATFORMS[0],
    });
    expect(platformAccessOf(platform(DRIVE), listed, operator)).toEqual({
      status: 'notAccessible',
    });
  });

  it('collapses unknown Platforms, company scope and no actor into one “not accessible”', () => {
    expect(platformAccessOf(platform(platformId('nope')), listed, owner)).toEqual({
      status: 'notAccessible',
    });
    expect(platformAccessOf({ kind: 'company' }, listed, owner)).toEqual({
      status: 'notAccessible',
    });
    expect(platformAccessOf(platform(SCHOOL), listed, null)).toEqual({ status: 'notAccessible' });
    expect(platformAccessOf(platform(SCHOOL), { status: 'forbidden' }, operator)).toEqual({
      status: 'notAccessible',
    });
  });
});
