import { Actor } from '../../../core/auth/actor';
import { Grants, Identity } from '../../../core/auth/auth.model';
import { companyId, platformId } from '../../../core/context/scope.model';
import { authorizedReturn, resolveLanding } from './landing';

const SCHOOL = platformId('school-id');
const DRIVE = platformId('drive-id');

const identity = (adminTier: Identity['adminTier']): Identity => ({
  userId: 'u',
  email: 'person@x.invalid',
  phone: null,
  adminTier,
});
const grants = (patch: Partial<Grants> = {}): Grants => ({
  companyId: null,
  platformAssignments: [],
  ...patch,
});

const owner: Actor = {
  kind: 'owner',
  userId: 'o',
  email: 'o@x.invalid',
  companyId: companyId('c'),
};
const operator: Actor = {
  kind: 'operator',
  userId: 'p',
  email: 'p@x.invalid',
  platformAssignments: [SCHOOL, DRIVE],
};

describe('resolveLanding (default landing)', () => {
  it('lands an owner on the Company overview', () => {
    expect(resolveLanding(identity('owner'), grants({ companyId: companyId('company') }))).toEqual({
      kind: 'enter',
      url: '/overview',
      actor: { kind: 'owner', userId: 'u', email: 'person@x.invalid', companyId: 'company' },
    });
  });

  it('keeps a display name only when Core gave one', () => {
    const named = { ...identity('owner'), displayName: 'Salim' };
    const landing = resolveLanding(named, grants({ companyId: companyId('company') }));
    expect(landing.kind === 'enter' && landing.actor.displayName).toBe('Salim');
  });

  it('gives an owner without a Company no access', () => {
    expect(resolveLanding(identity('owner'), grants())).toEqual({
      kind: 'noAccess',
      contact: 'person@x.invalid',
    });
  });

  it('names a phone-only identity without access by its phone', () => {
    expect(
      resolveLanding({ ...identity('operator'), email: null, phone: '+99900000001' }, grants()),
    ).toEqual({ kind: 'noAccess', contact: '+99900000001' });
  });

  it('maps Core’s null phone to an actor without a phone, and keeps a null email as null', () => {
    const landing = resolveLanding(identity('owner'), {
      companyId: companyId('c'),
      platformAssignments: [],
    });
    expect(landing.kind === 'enter' && 'phone' in landing.actor).toBe(false);
    const phoneOnly = resolveLanding(
      { ...identity('operator'), email: null, phone: '+99900000001' },
      { companyId: null, platformAssignments: [platformId('school')] },
    );
    expect(phoneOnly.kind === 'enter' && phoneOnly.actor.email).toBeNull();
  });

  it('keeps the phone of a phone-only operator on the actor', () => {
    const landing = resolveLanding(
      { ...identity('operator'), email: null, phone: '+99900000001' },
      { companyId: null, platformAssignments: [platformId('school')] },
    );
    expect(landing.kind === 'enter' && landing.actor).toMatchObject({
      email: null,
      phone: '+99900000001',
    });
  });

  it('enters a single assigned Platform directly', () => {
    const landing = resolveLanding(identity('operator'), grants({ platformAssignments: [SCHOOL] }));
    expect(landing.kind === 'enter' && landing.url).toBe('/platforms/school-id');
    expect(landing.kind === 'enter' && landing.actor.kind).toBe('operator');
  });

  it('chooses between several assigned Platforms', () => {
    const landing = resolveLanding(
      identity('operator'),
      grants({ platformAssignments: [SCHOOL, DRIVE] }),
    );
    expect(landing.kind).toBe('choosePlatform');
  });

  it('never takes a Company-wide grant from an operator', () => {
    const landing = resolveLanding(
      identity('operator'),
      grants({ companyId: companyId('company'), platformAssignments: [SCHOOL] }),
    );
    expect(landing.kind === 'enter' && landing.actor.kind).toBe('operator');
    expect(landing.kind === 'enter' && landing.url).toBe('/platforms/school-id');
  });

  it('gives an operator without assignments, or a non-Admin account, no access', () => {
    expect(resolveLanding(identity('operator'), grants()).kind).toBe('noAccess');
    expect(
      resolveLanding(
        identity(null),
        grants({ companyId: companyId('company'), platformAssignments: [SCHOOL] }),
      ),
    ).toEqual({ kind: 'noAccess', contact: 'person@x.invalid' });
  });
});

describe('authorizedReturn (a safe internal URL is not enough)', () => {
  it('returns an owner to Company pages', () => {
    expect(authorizedReturn(owner, '/overview')).toEqual({ kind: 'page', url: '/overview' });
    expect(authorizedReturn(owner, '/platforms')).toEqual({ kind: 'page', url: '/platforms' });
  });

  it('never returns an operator to a Company-owner page', () => {
    expect(authorizedReturn(operator, '/overview')).toBeNull();
    expect(authorizedReturn(operator, '/platforms')).toBeNull();
  });

  it('returns to a Platform scope only for an assigned Platform, still to confirm with Core', () => {
    expect(authorizedReturn(operator, '/platforms/drive-id')).toEqual({
      kind: 'platform',
      url: '/platforms/drive-id',
      platformId: 'drive-id',
    });
    expect(authorizedReturn(operator, '/platforms/other-id')).toBeNull();
    expect(authorizedReturn(operator, '/platforms/drive-idx')).toBeNull();
    // An owner's Platform list is not in grants: Core's platform-access check decides.
    expect(authorizedReturn(owner, '/platforms/other-id')?.kind).toBe('platform');
  });

  it('follows only known Admin routes', () => {
    for (const url of [
      '/foundation',
      '/forbidden',
      '/session-unavailable',
      '/platforms/a/b',
      '/x',
    ]) {
      expect(authorizedReturn(owner, url)).toBeNull();
    }
    expect(authorizedReturn(owner, null)).toBeNull();
  });
});
